"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {classifyAttempt,bestAttempt,summarizeRoute,formatLapTime}=require("../domain.js");
const attempt=(driver,time,more={})=>({
 driver,time,completion:"complete",validity:"accepted",quality:"continuous",
 class:"A",pi:800,mode:"Rivals",source:"recorded",timing_source:"game-reported",...more
});
const route=(items,more={})=>({competitive_equivalence:"verified",ranked:true,attempts:items,...more});
test("valid recorded game-timed laps may rank",()=>{
 const r=summarizeRoute(route([attempt("A",92.418),attempt("B",93.060)]));
 assert.equal(r.comparable,true);
 assert.equal(r.winner,"A");
 assert.equal(r.margin_s.toFixed(3),"0.642");
});
test("unfinished and provisional laps cannot become records",()=>{
 const r=route([attempt("A",100),attempt("B",110),attempt("B",88,{completion:"incomplete"}),attempt("B",89,{completion:"provisional"})]);
 assert.equal(bestAttempt(r,"B").time,110);
});
test("suspect, excluded and discontinuous runs remain ineligible",()=>{
 for(const changes of [{validity:"suspect"},{validity:"excluded"},{quality:"discontinuous"},{quality:"unknown"},{time:null}]){
  assert.equal(classifyAttempt(attempt("A",92,changes)).eligible,false);
 }
});
test("no numeric zero or NaN interpreted as a lap",()=>{
 for(const value of [0,-1,NaN,Infinity,undefined,null])assert.equal(classifyAttempt(attempt("A",value)).eligible,false);
});
test("do not invent a winner without both drivers",()=>{
 const r=summarizeRoute(route([attempt("A",92)]));
 assert.equal(r.comparable,false);assert.equal(r.winner,null);
});
test("no ranked winner for missing route/rule equivalence",()=>{
 const r=summarizeRoute(route([attempt("A",92),attempt("B",93)],{competitive_equivalence:"unknown"}));
 assert.ok(r.reasons.includes("route_or_rules_not_verified"));
});
test("no ranked winner across mismatched class, PI, mode or direction",()=>{
 for(const overrides of [{class:"S1"},{pi:799},{mode:"Unknown"},{mode:"Circuit race"},{mode:"Sprint (inferred)"}]){
  const r=summarizeRoute(route([attempt("A",92),attempt("B",93,overrides)]));
  assert.equal(r.comparable,false);
 }
 const r=summarizeRoute(route([attempt("A",92,{route_direction:"clockwise"}),attempt("B",93,{route_direction:"counterclockwise"})]));
 assert.equal(r.comparable,false);
});
test("newly imported data without timing provenance stays unranked",()=>{
 const a=attempt("A",92,{timing_source:undefined});
 const r=summarizeRoute(route([a,attempt("B",93)]));
 assert.ok(r.reasons.includes("missing_eligible_driver_lap"));
});
test("synthetic fixture compares only with demo=true and ranked demo route",()=>{
 const synthetic=route([attempt("A",92,{source:undefined,timing_source:undefined}),attempt("B",93,{source:undefined,timing_source:undefined})]);
 assert.equal(summarizeRoute(synthetic).comparable,false);
 assert.equal(summarizeRoute(synthetic,{demo:true}).winner,"A");
 assert.equal(summarizeRoute({...synthetic,ranked:false},{demo:true}).comparable,false);
});
test("time formatting rounds across minute boundary and rejects invalid values",()=>{
 assert.equal(formatLapTime(59.9996),"1:00.000");
 assert.equal(formatLapTime(93.06),"1:33.060");
 for(const t of [0,-2,NaN,null,undefined,Infinity])assert.equal(formatLapTime(t),"—");
});
