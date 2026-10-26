const {test} = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm");
const source = fs.readFileSync("app/static/js/debrief.js","utf8");
const sample = () => ({stats:{laps_runs:3,eligible:2,best_s:60,best_estimated:false,
  median_s:60.5,confirmed:2,spread_s:1,estimated:0},
  pair:{a:3,b:1,difference_s:2,a_finish:"confirmed",b_finish:"last_packet",a_eligible:true,b_eligible:true},
  facts:[],warnings:["<script>untrusted</script>"],ai:{state:"missing",enabled:true,budget:{remaining_usd:1}}});
function panel(fetcher) {
  const summary = {}, status = {}, content = {innerHTML:"",textContent:"",children:[],
    append(child){this.children.push(child);},querySelector(){return status;},querySelectorAll(){return [];}};
  const host = {open:false,innerHTML:"",addEventListener(){},
    querySelector(selector){return selector === "summary" ? summary : content;}};
  const requests = [], context = {AbortController,document:{createElement:()=>({dataset:{}})},
    RivalryModel:{time:value=>`${value.toFixed(3)} s`},
    fetch:async(url,options)=>{requests.push({url,options});return fetcher(url,options);}};
  vm.createContext(context);vm.runInContext(source,context);
  return {controller:new context.SessionDebrief(host),host,content,summary,status,requests};
}
const a = {lap_id:3,session_id:2,driver_name:"<img src=x>"}, b = {lap_id:1};
const response = data => ({ok:true,status:200,json:async()=>data});
test("collapsed panel costs nothing; relative GET, explicit POST and escaped output",async()=>{
  const p=panel(async()=>response(sample()));p.controller.setContext(a,b);
  assert.equal(p.requests.length,0);p.host.open=true;await p.controller.load();
  assert.equal(p.requests[0].url,"api/debrief?lap_a=3&lap_b=1");
  assert.equal(p.requests[0].options.method,undefined);
  assert.match(p.content.innerHTML,/includes an estimate/);assert.match(p.content.innerHTML,/B: estimated finish/);
  assert.match(p.content.innerHTML,/&lt;script&gt;/);assert.doesNotMatch(p.content.innerHTML,/<script>/);
  await p.controller.load(true);
  assert.equal(p.requests[1].url,"api/debrief/generate");assert.equal(p.requests[1].options.method,"POST");
  assert.deepEqual(JSON.parse(p.requests[1].options.body),{lap_a:3,lap_b:1,retry:false});
});
test("late response cannot attach old advice to another lap selection",async()=>{
  const waits=[],p=panel(()=>new Promise(resolve=>waits.push(resolve)));
  p.controller.setContext(a,b);p.host.open=true;const old=p.controller.load();
  p.controller.setContext({...a,lap_id:4},b);waits[0](response(sample()));await old;
  assert.doesNotMatch(p.content.innerHTML,/Session recorded best/);
  waits[1](response({...sample(),stats:{...sample().stats,best_s:61}}));
  await new Promise(resolve=>setImmediate(resolve));assert.match(p.content.innerHTML,/61.000 s/);
});
test("login error preserves measurements and never retries itself",async()=>{
  const p=panel(async(url)=>url.includes("generate")?{ok:false,status:403}:response(sample()));
  p.controller.setContext(a,b);await p.controller.load();const before=p.content.innerHTML;
  await p.controller.load(true);assert.equal(p.content.innerHTML,before);
  assert.match(p.status.textContent,/signed-in account with SplitTime access/);assert.equal(p.requests.length,2);
});
test("failed calls need explicit retry; pending/cached reports disable generation",async()=>{
  const p=panel(async()=>response(sample()));p.controller.setContext(a,b);
  p.controller.render({...sample(),ai:{...sample().ai,state:"failed"}});await p.controller.load(true);
  assert.equal(JSON.parse(p.requests[0].options.body).retry,true);
  p.controller.render({...sample(),ai:{...sample().ai,state:"pending"}});
  assert.match(p.content.innerHTML,/data-debrief="generate" disabled/);
  p.controller.render({...sample(),ai:{...sample().ai,state:"ready",cost_or_reserved_usd:.000414,
    explanation:{highlights:["<img>"],focus:"<svg>",practice:"Try one small change."}}});
  assert.match(p.content.innerHTML,/Cached Gemini 3.8 Flash/);assert.match(p.content.innerHTML,/&lt;img&gt;/);
  assert.match(p.content.innerHTML,/One practice focus/);
  assert.match(p.content.innerHTML,/data-debrief="generate" disabled/);
});
test("the session review lives on Analysis, next to that session's laps, not on Rivalry",()=>{
  const read=f=>fs.readFileSync(`app/static/${f}`,"utf8");
  const analysis=read("analysis.html"),rivalry=read("rivalry-v2.html"),code=read("js/analysis.js");
  assert.match(analysis,/<details id="st-debrief"/);assert.match(analysis,/js\/debrief\.js/);
  assert.match(analysis,/js\/rivalry-v2-model\.js/);  // debrief.js formats times with it
  assert.doesNotMatch(rivalry,/st-debrief"|js\/debrief\.js/);
  assert.match(code,/new globalThis\.SessionDebrief\(\$\("#st-debrief"\)\)/);
  assert.match(code,/sessionReview\.setContext\(lap\(a\), same \? lap\(b\) : null, refresh\)/);
});
test("Analysis gives the review a B only on A's known route, and refreshes it after an edit",()=>{
  const code=fs.readFileSync("app/static/js/analysis.js","utf8");
  const start=code.indexOf("function reviewContext("),body=code.slice(start,code.indexOf("\n}\n",start)+3);
  const calls=[];
  const run=(picks,refresh)=>{calls.length=0;vm.runInNewContext(body+";reviewContext(refresh)",
    {sessionReview:{setContext:(...args)=>calls.push(args)},state:{picks},driverLabel:s=>s.driver_name,refresh});return calls[0];};
  const pick=(id,route)=>({lapId:id,session:{id:id*10,route_id:route,driver_name:"D"}});
  assert.equal(run([pick(1,4),pick(2,4)])[1].lap_id,2);
  assert.equal(run([pick(1,4),pick(2,5)])[1],null);       // another route: A alone
  assert.equal(run([pick(1,null),pick(2,null)])[1],null); // unknown routes: A alone
  assert.equal(run([pick(1,4)],true)[2],true);
  assert.match(code,/renderPicks\(\);\n  reviewContext\(true\);/);  // after reloadSession's edit refresh
});
