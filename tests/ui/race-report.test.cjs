const {test} = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm");
const source = fs.readFileSync("app/static/js/race-report.js","utf8");
const side = (extra={}) => ({flat_pct:48,min_kmh:162,max_kmh:257,...extra});
const sample = () => ({lap_a:98,lap_b:174,reference_lap_id:174,warnings:["<script>untrusted</script>"],
  facts:{a_gain_s:-4.751,route_m:5965,same_car:true,
    lap:{a:{flat_pct:42,max_kmh:320,max_g:3.7,pedals:"progressive",steering:"progressive"},
         b:{flat_pct:74,max_kmh:323,max_g:4.1,pedals:"on_off",steering:"on_off"}},
    sections:[{n:1,from_m:0,to_m:932,corners:[1,2],a_gain_s:.357,a_ahead_after_s:.357,a:side(),b:side()},
              {n:2,from_m:932,to_m:5965,corners:[19],a_gain_s:-5.108,a_ahead_after_s:-4.751,a:side(),b:side()}],
    corners:[{c:19,a_gain_s:-.42,a:{gear:3,min_kmh:162,exit_kmh:180},b:{gear:5,min_kmh:216,exit_kmh:225}}]},
  ai:{state:"missing",enabled:true,budget:{remaining_usd:1}}});
function panel(fetcher, options) {
  const summary = {}, status = {}, content = {innerHTML:"",textContent:"",
    querySelector(){return status;},querySelectorAll(){return [];}};
  const host = {open:false,innerHTML:"",addEventListener(){},
    querySelector(selector){return selector === "summary" ? summary : content;}};
  const requests = [], context = {AbortController,
    fetch:async(url,options)=>{requests.push({url,options});return fetcher(url,options);}};
  vm.createContext(context);vm.runInContext(source,context);
  return {controller:new context.RaceReport(host,options),host,content,summary,status,requests};
}
const a = {lap_id:98,driver_name:"<img src=x>"}, b = {lap_id:174,driver_name:"Captn Compass"};
const response = data => ({ok:true,status:200,json:async()=>data});
test("needs both laps, costs nothing collapsed, then measures with a relative GET",async()=>{
  const p=panel(async()=>response(sample()));
  p.host.open=true;p.controller.setContext(a,null);await p.controller.load();
  assert.equal(p.requests.length,0);p.host.open=false;
  p.controller.setContext(a,b);assert.equal(p.requests.length,0);
  assert.match(p.summary.textContent,/\(A\) vs Captn Compass \(B\)/);
  p.host.open=true;await p.controller.load();
  assert.equal(p.requests[0].url,"api/race-report?lap_a=98&lap_b=174");
  assert.equal(p.requests[0].options.method,undefined);
  const html=p.content.innerHTML;
  assert.match(html,/<strong>Captn Compass<\/strong> faster by <span class="st-time">4.751 s/);
  assert.match(html,/Section 2 · 0.9 km–6.0 km · C19/);
  assert.match(html,/on\/off pedals, on\/off steering/);
  assert.match(html,/&lt;img src=x&gt;/);assert.doesNotMatch(html,/<img|<script>/);
  assert.match(html,/data-race="generate" >Write AI race report/);
  assert.match(html,/needs a signed-in SplitTime account/);assert.doesNotMatch(html,/Management login/);
  await p.controller.load(true);
  assert.equal(p.requests[1].url,"api/race-report/generate");assert.equal(p.requests[1].options.method,"POST");
  assert.deepEqual(JSON.parse(p.requests[1].options.body),{lap_a:98,lap_b:174,retry:false});
});
test("names go into the narrative only here, escaped; cached reports disable writing",async()=>{
  const p=panel(async()=>response(sample()));p.controller.setContext(a,b);
  p.controller.render({...sample(),ai:{...sample().ai,state:"ready",cost_or_reserved_usd:.0011,narrative:{
    headline:"{B} takes it by 4.751 s",story:"{A} lifted <b>early</b>.",
    a:{strengths:[],costs:["C19 in 3rd."],practice:"Stay flat."},b:{strengths:["Flat out."],costs:[],practice:"Brake less."}}}});
  const html=p.content.innerHTML;
  assert.match(html,/<strong>Captn Compass<\/strong> takes it by 4.751 s/);
  assert.match(html,/<strong>&lt;img src=x&gt;<\/strong> lifted &lt;b&gt;early&lt;\/b&gt;/);
  assert.match(html,/Written by Gemini 3.8 Flash/);assert.doesNotMatch(html,/data-race="generate"/);
  // the written review comes first, before the measured sections
  assert.ok(html.indexOf("Race engineer’s review")<html.indexOf("Where the time went"));
  assert.ok(html.indexOf("takes it by")<html.indexOf("Where the time went"));
});
test("login error keeps the measurements; failures need an explicit retry",async()=>{
  const p=panel(async(url)=>url.includes("generate")?{ok:false,status:403}:response(sample()));
  p.controller.setContext(a,b);await p.controller.load();const before=p.content.innerHTML;
  await p.controller.load(true);assert.equal(p.content.innerHTML,before);
  assert.match(p.status.textContent,/signed-in account with SplitTime access/);assert.equal(p.requests.length,2);
  p.controller.render({...sample(),ai:{...sample().ai,state:"failed"}});
  assert.match(p.content.innerHTML,/did not pass the fact check/);
  await p.controller.load(true);assert.equal(JSON.parse(p.requests[2].options.body).retry,true);
});
test("a late answer cannot land on a newer selection",async()=>{
  const waits=[],p=panel(()=>new Promise(resolve=>waits.push(resolve)));
  p.controller.setContext(a,b);p.host.open=true;const old=p.controller.load();
  p.controller.setContext({...a,lap_id:99},b);waits[0](response(sample()));await old;
  assert.doesNotMatch(p.content.innerHTML,/faster by/);
});
test("then vs now: one driver's best against their first run, asked for in progress mode",async()=>{
  const now={lap_id:98,driver_name:"Captn Compass"},then={lap_id:21,driver_name:"Captn Compass"};
  const p=panel(async()=>response({...sample(),facts:{...sample().facts,a_gain_s:4.751}}),{mode:"progress"});
  assert.match(p.host.innerHTML,/Then vs now · choose a driver/);
  p.controller.setContext(now,then);assert.equal(p.summary.textContent,"Then vs now · Captn Compass");
  await p.controller.load();
  assert.equal(p.requests[0].url,"api/race-report?lap_a=98&lap_b=21&mode=progress");
  let html=p.content.innerHTML;
  assert.match(html,/<strong>Captn Compass<\/strong>’s best is <span class="st-time">4.751 s<\/span> faster than their first clean run/);
  assert.match(html,/Captn Compass \(then\) \+/);assert.match(html,/Write AI progress review/);
  await p.controller.load(true);
  assert.deepEqual(JSON.parse(p.requests[1].options.body),{lap_a:98,lap_b:21,retry:false,mode:"progress"});
  p.controller.render({...sample(),ai:{...sample().ai,state:"ready",cost_or_reserved_usd:.0011,narrative:{
    headline:"{A} finds 4.751 s",story:"Later braking than {B}.",improved:["Braking <i>later</i>."],
    still_to_find:["Section 2."],practice:"Carry speed."}}});
  html=p.content.innerHTML;
  assert.match(html,/<strong>Captn Compass \(now\)<\/strong> finds 4.751 s/);
  assert.match(html,/Improved<\/p><ul><li>Braking &lt;i&gt;later&lt;\/i&gt;.<\/li>/);
  assert.match(html,/Still to find<\/p><ul><li>Section 2./);assert.match(html,/Engineer’s progress review/);
});
