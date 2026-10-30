"use strict";
const {test} = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm");
const context = {};vm.createContext(context);
vm.runInContext(fs.readFileSync("app/static/js/updates.js","utf8"),context);
const U = context.Updates;

function setup(tokens) {
  const env = {tokens:[...tokens], visible:true, clock:0, asked:0, changes:[]};
  env.watcher = U.watch({
    fetchToken: async () => {env.asked++; return env.tokens.length ? env.tokens.shift() : null;},
    visible: () => env.visible, now: () => env.clock, onChange: (token, unsure) => env.changes.push(unsure ? `${token}?` : token)});
  return env;
}

test("first token is the baseline; a different one is offered once",async()=>{
  const env=setup(["a","a","b","c"]);
  await env.watcher.check(true);await env.watcher.check(true);
  assert.deepEqual(env.changes,[]);
  await env.watcher.check(true);
  assert.deepEqual(env.changes,["b"]);
  await env.watcher.check(true);           // waiting on the bar: no more requests
  assert.equal(env.asked,3);
});
test("hidden tabs ask nothing after the baseline; coming back is throttled",async()=>{
  const env=setup(["a","b","b"]);
  env.visible=false;
  await env.watcher.check(true);           // baseline even in a background tab
  await env.watcher.check(true);
  assert.equal(env.asked,1);
  env.visible=true;env.clock=5000;
  await env.watcher.check();               // returning within 15 s of the last ask
  assert.equal(env.asked,1);
  env.clock=20000;
  await env.watcher.check();
  assert.deepEqual(env.changes,["b"]);
});
test("Later keeps watching from what is showing; failures change nothing",async()=>{
  const env=setup(["a","b",null,"b","c"]);
  await env.watcher.check(true);await env.watcher.check(true);
  env.watcher.later("b");
  await env.watcher.check(true);await env.watcher.check(true);
  assert.deepEqual(env.changes,["b"]);
  await env.watcher.check(true);
  assert.deepEqual(env.changes,["b","c"]);
});
test("a failed first check offers a refresh once a token arrives",async()=>{
  const env=setup([null,"after-race","after-race"]);
  await env.watcher.check(true);
  assert.deepEqual(env.changes,[]);
  await env.watcher.check(true);
  assert.deepEqual(env.changes,["after-race?"]);
  env.watcher.later("after-race");
  await env.watcher.check(true);
  assert.deepEqual(env.changes,["after-race?"]);
});
function page(answer) {
  const log = [], listeners = {}, bars = [];
  const ctx = {log, bars, setInterval(){}, setTimeout, Promise, Date,
    document:{visibilityState:"visible", addEventListener:(name, fn) => {listeners[name]=fn;},
      createElement: () => ({style:{}, setAttribute(){}, addEventListener(){}, remove(){}}),
      body:{append: bar => bars.push(bar.innerHTML)}},
    fetch: async url => {
      log.push(`start ${url}`);
      const token = url === "api/changes" ? await answer() : null;
      log.push(`end ${url}`);
      return {ok:true, json: async () => ({token})};
    }};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("app/static/js/updates.js","utf8"), ctx);
  return ctx;
}
test("the page's own results wait for the baseline token",async()=>{
  let release; const gate = new Promise(done => {release = done;});
  const ctx = page(async () => {await gate; return "t1";});
  const results = ctx.fetch("api/stats");
  await new Promise(done => setTimeout(done, 20));
  assert.deepEqual(ctx.log, ["start api/changes"]);   // api/stats not sent yet
  release();
  await results;
  assert.deepEqual(ctx.log, ["start api/changes","end api/changes","start api/stats","end api/stats"]);
  await ctx.fetch("css/x.css");                       // anything else is never held
  assert.equal(ctx.bars.length, 0);                   // a prompt baseline is no change
});
test("a baseline slower than the wait lets results through and marks the first token unsure",async()=>{
  const ctx = page(() => new Promise(done => setTimeout(() => done("t1"), 2300)));
  const started = Date.now();
  await ctx.fetch("api/stats");
  assert.ok(Date.now() - started < 2250);
  assert.equal(ctx.bars.length, 0);
  await new Promise(done => setTimeout(done, 400));   // the late token arrives
  assert.equal(ctx.bars.length, 1);
  assert.match(ctx.bars[0], /Results may have changed since this page loaded/);
});
