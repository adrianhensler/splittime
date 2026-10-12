"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {classifyAttempt,bestAttempt,summarizeRoute,formatLapTime,normalizeCarClass}=require("../domain.js");
const attempt=(driver,time,more={})=>({driver,time,completion:"complete",validity:"accepted",quality:"continuous",class:"A",pi:800,mode:"Rivals",source:"recorded",timing_source:"game-reported",...more});
const route=(attempts,more={})=>({competitive_equivalence:"verified",ranked:true,attempts,...more});
test("match per category before choosing personal best; faster incompatible lap does not hide comparison",()=>{
 const r=summarizeRoute(route([attempt("A",90,{class:"S1",pi:900}),attempt("A",95),attempt("B",96)]));
 assert.equal(r.comparable,true);assert.equal(r.winner,"A");assert.equal(r.a.time,95);assert.equal(r.category.class,"A");
});
test("equal times are a tie without a winner",()=>{const r=summarizeRoute(route([attempt("A",92.5),attempt("B",92.5)]));assert.equal(r.tie,true);assert.equal(r.winner,null);assert.equal(r.margin_s,0)});
test("partial route direction is not a verified match",()=>assert.equal(summarizeRoute(route([attempt("A",92,{route_direction:"cw"}),attempt("B",93)])).comparable,false));
test("both unknown car categories fail closed, including undefined===undefined",()=>assert.equal(summarizeRoute(route([attempt("A",92,{class:undefined,pi:undefined}),attempt("B",93,{class:undefined,pi:undefined})])).comparable,false));
test("rank by class with unequal PI under ADR 10 default, strictPI optional",()=>{
 const r=route([attempt("A",92),attempt("B",93,{pi:799})]);
 assert.equal(summarizeRoute(r).comparable,true);
 assert.equal(summarizeRoute(r,{strictPI:true}).comparable,false);
});
test("infer two real driver IDs rather than hard-coded A and B",()=>{
 const r=route([attempt("alice",92),attempt("bob",93)]);
 assert.equal(bestAttempt(r,"alice").time,92);
 assert.equal(summarizeRoute(r).comparable,true);
 assert.deepEqual(summarizeRoute(r).driverIds,["alice","bob"]);
});
test("never coerce string, zero, negative, NaN or infinite lap times",()=>{
 for(const t of ["92.4",0,-1,NaN,Infinity,null,undefined])assert.equal(classifyAttempt(attempt("A",t)).eligible,false);
});
test("inferred mode is distinct provenance, not an automatic invalidation",()=>{
 const r=route([attempt("A",92,{mode:"Rivals (inferred)"}),attempt("B",93,{mode:"Rivals (inferred)"})]);
 assert.equal(summarizeRoute(r).comparable,true);
});
test("unknown mode blocks scoring; different modes do not silently rank",()=>{
 for(const mode of ["Unknown","Sprint (inferred)","Circuit race"])assert.equal(summarizeRoute(route([attempt("A",92),attempt("B",93,{mode})])).comparable,false);
});
test("null and malformed attempts cannot crash a comparison",()=>{
 const r=route([null,{},attempt("A",92),attempt("B",93)]);
 assert.doesNotThrow(()=>summarizeRoute(r));assert.equal(summarizeRoute(r).comparable,true);
});
test("worker cannot silently turn failed or incomplete into winning laps",()=>{
 const a=route([attempt("A",100),attempt("B",110),attempt("B",80,{completion:"incomplete"}),attempt("B",81,{completion:"provisional"}),attempt("B",82,{validity:"suspect"}),attempt("B",83,{quality:"discontinuous"})]);
 assert.equal(bestAttempt(a,"B").time,110);assert.equal(summarizeRoute(a).winner,"A");
});
test("unknown and unverified source/timing/route policy fail closed",()=>{
 const a=attempt("A",92),b=attempt("B",93);
 assert.equal(summarizeRoute(route([a,b],{competitive_equivalence:"unknown"})).comparable,false);
 assert.equal(summarizeRoute(route([{...a,source:"simulation"},b])).comparable,false);
 assert.equal(summarizeRoute(route([{...a,timing_source:"estimated"},b])).comparable,false);
 assert.equal(summarizeRoute(route([{...a,source:"simulation",timing_source:undefined},{...b,source:"simulation",timing_source:undefined}]),{demo:true}).comparable,true);
});
test("lap time formatting rounds and rejects bad values",()=>{
 assert.equal(formatLapTime(59.9996),"1:00.000");assert.equal(formatLapTime(93.06),"1:33.060");
 for(const x of [0,-2,null,undefined,NaN,Infinity])assert.equal(formatLapTime(x),"—");
});
test("source arrays never mutate and class index maps to label",()=>{
 const items=[attempt("A",92),attempt("B",93)];const s=JSON.stringify(items);
 summarizeRoute(route(items));assert.equal(JSON.stringify(items),s);
 assert.equal(normalizeCarClass(3),"A");assert.equal(normalizeCarClass("s1"),"S1");
});
