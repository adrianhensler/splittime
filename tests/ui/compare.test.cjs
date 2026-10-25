"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const vm=require("node:vm"),fs=require("node:fs"),path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"../../app/static/js/compare.js"),"utf8");
async function run(result,query="?lap_a=11&lap_b=12"){
 const controls=new Map(),calls=[];
 const elt=id=>{if(!controls.has(id))controls.set(id,{textContent:"",innerHTML:"",className:""});return controls.get(id);};
 const lap={lap:{lap_time:43},dist:[0,100],channels:{speed_kmh:[20,50],throttle:[0,100],brake:[100,0]}};
 const ctx=vm.createContext({document:{getElementById:elt},location:{search:query},URLSearchParams,
  fetch:async url=>{calls.push(url);return {ok:true,json:async()=>url.includes('corners/compare')?result:lap};}});
 await new vm.Script(source).runInContext(ctx);
 return {elt,calls};
}
function payload(){return {a:{capture_quality:"continuous",timing_source:"game_lap_clock",gaps:0},
 b:{capture_quality:"discontinuous",timing_source:"game_lap_clock",gaps:2},reasons:[],
 corners:{reference_lap_id:11,warnings:[]},totals:{dt:0.3},sum_check:{residual:0.01},segments:[],largest:[]};}
test("trace page renders measured quality and shared channels, with relative API paths",async()=>{
 const {elt,calls}=await run(payload());
 assert.match(elt('summary').innerHTML,/discontinuous/);
 assert.match(elt('traces').innerHTML,/Speed \(km\/h\)/);
 assert.match(elt('traces').innerHTML,/Throttle \(%\)/);
 assert.match(elt('corners').innerHTML,/No detected corners/);
 assert.ok(calls.every(url=>url.startsWith('api/')));
});
test("thin recordings with no totals remain inspectable and preserve warnings",async()=>{
 const result=payload();result.totals=null;result.reasons=['too_few_samples'];
 result.corners.warnings=['<img src=x onerror=evil()>'];
 const {elt}=await run(result);
 assert.match(elt('summary').innerHTML,/too few captured samples/);
 assert.doesNotMatch(elt('summary').innerHTML,/<img/);
 assert.match(elt('summary').innerHTML,/&lt;img/);
 assert.doesNotMatch(elt('status').textContent,/Could not compare/);
});
test("invalid lap IDs are rejected before any requests",async()=>{
 const {elt,calls}=await run(payload(),'?lap_a=<script>&lap_b=2');
 assert.equal(calls.length,0);assert.match(elt('status').textContent,/Choose two laps/);
});

test('unverified equivalence and clock warnings are explained beside lap times',async()=>{
 const result=payload();result.comparable=false;
 result.reasons=['route_equivalence_unverified','lap_clock_discontinuous'];
 result.b.warnings=['lap clock runs backwards mid-lap'];
 const {elt}=await run(result),text=elt('summary').innerHTML;
 assert.match(text,/comparison is exploratory/);
 assert.match(text,/Segment times are diagnostic only/);
 assert.match(text,/B: lap clock runs backwards/);
 assert.doesNotMatch(text,/route_equivalence_unverified/);
 assert.match(text,/Exploratory comparison · see the warnings above/);
});
test('route equivalence alone is a caveat, not an incomplete comparison',async()=>{
 const result=payload();result.comparable=false;result.reasons=['route_equivalence_unverified'];
 const {elt}=await run(result),text=elt('summary').innerHTML;
 assert.match(text,/Telemetry aligned · same recorded route; official route equivalence is not verified/);
 assert.doesNotMatch(text,/evidence is incomplete/);
});
