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
