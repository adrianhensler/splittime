"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const root = path.join(__dirname,"../..");
const M = require(path.join(root,"app/static/js/rivalry-v2-model.js"));
const drivers = [{id:"b",name:"Blair"},{id:"a",name:"Alex"}];
const lap = (id,driver,time,seconds,extra={}) => ({lap_id:id,session_id:id,lap_number:0,
  driver_id:driver,driver_name:driver === "a" ? "Alex" : "Blair",time_s:time,
  started_at_utc:"2026-01-01T00:00:00Z",finished_at_utc:seconds === null ? null : new Date(1767225600000+seconds*1000).toISOString(),
  car_name:"Test car",car_pi:800,completion:"complete",validity:"accepted",candidate_clean:true,
  flags:[],flags_auto:[],...extra});
const group = attempts => ({route_id:3,route_name:"Test Circuit",car_class:3,car_class_label:"A",attempts});
test("millisecond rounding carries across the minute", () => {
  assert.equal(M.time(59.9999),"1:00.000"); assert.equal(M.time(null),"—");
});
test("cutoff, excluded and contact cannot become a recorded best", () => {
  const g = group([lap(1,"a",50,10),lap(2,"a",40,20,{flags_auto:["cutoff"]}),
    lap(3,"a",30,30,{validity:"excluded"}),lap(4,"a",20,40,{flags:["contact"]})]);
  assert.equal(M.bests(g).get("a").lap_id,1);
  assert.equal(M.timeline(g,drivers).filter(l=>l.pb).length,1);
});
test("history shows own improvements and a genuine recorded lead change", () => {
  const g = group([lap(1,"a",60,10),lap(2,"b",59,20),lap(3,"a",58,30),lap(4,"a",58,40)]);
  const rows = M.timeline(g,drivers);
  assert.equal(rows[1].lead,true); assert.equal(rows[1].delta,2);
  assert.equal(rows[0].pb,false); assert.equal(rows[2].lead,false);
});
test("missing finish dates and simultaneous finishes do not fabricate lead chronology", () => {
  const unknown = M.timeline(group([lap(1,"a",60,null),lap(2,"a",59,20)]),drivers);
  assert.equal(unknown.some(l=>l.pb || l.lead),false);
  const simultaneous = M.timeline(group([lap(1,"a",60,10),lap(2,"b",59,10)]),drivers);
  assert.equal(simultaneous.some(l=>l.lead),false);
  const sameDriver = M.timeline(group([lap(1,"a",60,10),lap(2,"a",59,10)]),drivers);
  assert.deepEqual(sameDriver.filter(l=>l.pb).map(l=>l.lap_id),[2]);
});
test("unknown routes stay isolated by session, even with the same class", () => {
  assert.notEqual(M.key({...group([lap(1,"a",60,10)]),route_id:null}),
    M.key({...group([lap(2,"a",60,10)]),route_id:null}));
  assert.notEqual(M.key({...group([]),route_id:null,route_name:"Unknown session 1"}),
    M.key({...group([]),route_id:null,route_name:"Unknown session 2"}));
});
test("A and B use configured driver order; solo comparisons use own history", () => {
  assert.deepEqual(M.defaults(group([lap(1,"a",60,10),lap(2,"b",59,20)]),drivers),[2,1]);
  assert.deepEqual(M.defaults(group([lap(1,"a",60,10),lap(2,"a",59,20)]),drivers),[2,1]);
  assert.equal(M.compare(lap(2,"a",60,10),lap(2,"a",60,10)),null);
  assert.equal(M.compare(lap(2,"a",60,10),lap(3,"a",60,10,{completion:"provisional"})),null);
  assert.equal(M.compare(lap(2,"a",60,10),lap(3,"a",60,10)),"compare.html?lap_a=2&lap_b=3");
});
test("search covers route, driver, car, flags and both dates; reused ID changes identity", () => {
  const l = lap(1,"a",60,10,{flags:["contact"]}), g = group([l]);
  assert.equal(M.matches(g,l,"circuit Alex contact"),true);
  assert.equal(M.matches(g,l,"2026-01-01"),true);
  assert.equal(M.matches(g,l,"Ferrari"),false);
  assert.notEqual(M.identity(l),M.identity({...l,time_s:61}));
});
function page(payload, storage = new Map()) {
  const controls = new Map(), calls = [];
  const elt = id => {
    if (!controls.has(id)) controls.set(id,{value:"",innerHTML:"",textContent:"",hidden:false,listeners:{},
      querySelector(){return null;},addEventListener(type,fn){this.listeners[type]=fn;}});
    return controls.get(id);
  };
  let data = payload, offline = false;
  const ctx = vm.createContext({RivalryModel:M,Intl,Date,document:{getElementById:elt,querySelectorAll:()=>[]},
    sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
    fetch:async(url,opts) => {calls.push({url,opts});if(offline)throw new Error("offline");
      return {ok:true,json:async()=>url === "api/rivalry" ? data : {outline:[0,0,100,100]}};}});
  new vm.Script(fs.readFileSync(path.join(root,"app/static/js/rivalry-v2.js"),"utf8")).runInContext(ctx);
  return {elt,calls,setData(value){data=value;},fail(){offline=true;},
    async settle(){for(let i=0;i<12;i++)await Promise.resolve();}};
}
test("controller fetches relative APIs, escapes names and handles filters and stale refresh", async () => {
  const payload = {drivers,categories:[group([lap(1,"a",60,10),lap(2,"b",59,20)])]};
  payload.categories[0].route_name = '<img onerror="evil()">';
  payload.drivers = [{id:"b",name:"<script>"},drivers[1]];
  const p = page(payload);await p.settle();
  assert.equal(p.calls[0].url,"api/rivalry");
  assert.ok(p.calls.every(call=>!call.opts?.method));
  assert.match(p.elt("st-events").innerHTML,/&lt;img/);
  assert.doesNotMatch(p.elt("st-events").innerHTML,/<img/);
  assert.match(p.elt("st-event-columns").innerHTML,/&lt;script/);
  assert.match(p.elt("st-inspector").innerHTML,/lap_a=2&lap_b=1/);
  p.elt("st-find").listeners.input({target:{value:"does not exist"}});
  assert.equal(p.elt("st-context").hidden,true);
  assert.match(p.elt("st-events").innerHTML,/No recordings match/);
  p.fail();await p.elt("st-refresh").listeners.click();
  assert.match(p.elt("st-message").textContent,/Previous results remain.*stale/);
  assert.equal(p.elt("st-refresh").disabled,false);
});
test("empty results and missing chronology stay explicit, no sample opponent", async () => {
  const p = page({drivers,categories:[]});await p.settle();
  assert.match(p.elt("st-events").innerHTML,/No recordings yet/);
  const solo = page({drivers,categories:[group([lap(1,"a",60,null)])]});await solo.settle();
  assert.match(solo.elt("st-events").innerHTML,/Record chronology unknown/);
  assert.match(solo.elt("st-events").innerHTML,/No unflagged best/);
  assert.doesNotMatch(solo.elt("st-inspector").innerHTML,/href="compare/);
});
test("refresh preserves a deliberate pair but resets reused lap IDs", async () => {
  const payload = {drivers,categories:[group([lap(1,"a",60,10),lap(2,"b",59,20),lap(3,"a",61,5)])]};
  const p = page(payload);await p.settle();
  p.elt("st-history").listeners.change({target:{dataset:{side:"b",lap:"3"}}});
  assert.match(p.elt("st-inspector").innerHTML,/lap_a=2&lap_b=3/);
  await p.elt("st-refresh").listeners.click();
  assert.match(p.elt("st-inspector").innerHTML,/lap_a=2&lap_b=3/);
  const changed = structuredClone(payload);changed.categories[0].attempts[2].session_id=88;
  p.setData(changed);await p.elt("st-refresh").listeners.click();
  assert.match(p.elt("st-inspector").innerHTML,/lap_a=2&lap_b=1/);
});
test("returning from comparison restores filter, search and verified lap pair", async () => {
  const storage = new Map(), payload = {drivers,categories:[group([lap(1,"a",60,10),lap(2,"b",59,20),lap(3,"a",61,5)])]};
  const first = page(payload,storage);await first.settle();
  first.elt("st-history-filter").listeners.change({target:{value:"improvements"}});
  first.elt("st-find").listeners.input({target:{value:"test"}});
  first.elt("st-history").listeners.change({target:{dataset:{side:"b",lap:"3"}}});
  const returned = page(payload,storage);await returned.settle();
  assert.equal(returned.elt("st-find").value,"test");
  assert.equal(returned.elt("st-history-filter").value,"improvements");
  assert.match(returned.elt("st-inspector").innerHTML,/lap_a=2&lap_b=3/);
  const changed = structuredClone(payload);changed.categories[0].attempts[2].session_id=88;
  const rebuilt = page(changed,storage);await rebuilt.settle();
  assert.match(rebuilt.elt("st-inspector").innerHTML,/lap_a=2&lap_b=1/);
});
