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
test("the server decides which laps count; the page never promotes one it ruled out", () => {
  const no = {candidate_clean:false};
  const g = group([lap(1,"a",50,10),lap(2,"a",40,20,{...no,flags_auto:["cutoff"],finish:"last_packet"}),
    lap(3,"a",30,30,{...no,validity:"excluded"}),lap(4,"a",20,40,{...no,flags:["contact"]})]);
  assert.equal(M.bests(g).get("a").lap_id,1);
  assert.equal(M.timeline(g,drivers).filter(l=>l.pb).length,1);
});
test("a last-packet time that covered the route can be the best, and is marked", () => {
  const run = lap(2,"a",40,20,{completion:"provisional",flags:["cutoff"],flags_auto:["cutoff"],finish:"last_packet"});
  const g = group([lap(1,"a",50,10),run]);
  assert.equal(M.bests(g).get("a").lap_id,2);
  assert.equal(M.estimated(run),true); assert.equal(M.estimated(lap(1,"a",50,10)),false);
});
test("bests by car and overall cross classes on one route; standings work for three drivers", () => {
  const cats = [{...group([lap(1,"a",60,10,{car_ordinal:1}),lap(2,"a",58,20,{car_ordinal:2}),lap(3,"b",59,30,{car_ordinal:1})])},
    {...group([lap(4,"a",50,40,{car_ordinal:3}),lap(5,"b",40,50,{car_ordinal:3,candidate_clean:false})]),car_class:5,car_class_label:"S2"},
    {...group([lap(6,"a",10,60,{car_ordinal:1})]),route_id:9}];
  const more = M.routeBests(cats,3);
  assert.equal(more.overall.get("a").lap_id,4); assert.equal(more.overall.get("b").lap_id,3);
  assert.deepEqual(more.cars.map(l=>l.lap_id),[4,2,3,1]);
  const three = group([lap(1,"a",60,10),lap(2,"b",59,20),lap(3,"c",58,30)]);
  assert.deepEqual(M.standings(three).map(l=>l.driver_id),["c","b","a"]);
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
  assert.equal(M.compare(lap(2,"a",60,10),lap(3,"a",60,10,{completion:"incomplete"})),null);
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
test("a contested row links straight to replay and compare of the two bests, leader first", async () => {
  const p = page({drivers,categories:[group([lap(1,"a",60,10),lap(2,"b",59,20),lap(3,"a",58.5,30,{candidate_clean:false})])]});
  await p.settle();
  assert.match(p.elt("st-events").innerHTML,/href="replay\.html\?laps=2,1"/);
  assert.match(p.elt("st-events").innerHTML,/href="compare\.html\?lap_a=2&lap_b=1"/);
  const solo = page({drivers,categories:[group([lap(1,"a",60,10)])]});await solo.settle();
  assert.doesNotMatch(solo.elt("st-events").innerHTML,/st-row-actions/);
});
test("empty results and missing chronology stay explicit, no sample opponent", async () => {
  const p = page({drivers,categories:[]});await p.settle();
  assert.match(p.elt("st-events").innerHTML,/No recordings yet/);
  const solo = page({drivers,categories:[group([lap(1,"a",60,null)])]});await solo.settle();
  assert.match(solo.elt("st-events").innerHTML,/Record chronology unknown/);
  assert.match(solo.elt("st-events").innerHTML,/No valid time yet/);
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
test("Analyse opens the race report for the pair, from the inspector or straight from a table row", async () => {
  const p = page({drivers,categories:[group([lap(1,"a",60,10),lap(2,"b",59,20)]),
    {...group([lap(3,"a",50,30),lap(4,"b",51,40)]),route_id:4,route_name:"Second Route"}]});
  await p.settle();
  assert.match(p.elt("st-inspector").innerHTML,/data-analyse>Analyse A vs B</);
  assert.match(p.elt("st-analysis-pair").textContent,/\(A, .*\) vs .*\(B, /);
  p.elt("st-inspector").listeners.click({target:{closest:sel => sel === "[data-analyse]" ? {} : null}});
  assert.equal(p.elt("st-race-report").open,true);
  // a row's Analyse selects that row's two bests, leader as A, and opens the analysis
  const rows = p.elt("st-events").innerHTML, index = rows.match(/data-analyse="(\d+)"[^]*?data-analyse="(\d+)"/);
  assert.ok(index);
  p.elt("st-race-report").open = false;
  let prevented = false;
  p.elt("st-events").listeners.click({preventDefault(){prevented = true;},
    target:{closest:sel => sel === "[data-analyse]" ? {dataset:{analyse:index[2]}} : null}});
  assert.equal(prevented,true);
  assert.equal(p.elt("st-race-report").open,true);
  assert.match(p.elt("st-inspector").innerHTML,/lap 3</);
  assert.match(p.elt("st-inspector").innerHTML,/compare\.html\?lap_a=3&amp;lap_b=4|compare\.html\?lap_a=3&lap_b=4/);
});
test("activity reads each improvement against the rival's best at that moment", () => {
  const cats = [group([lap(1,"a",60,10),lap(2,"b",61,20),lap(3,"b",59.5,30),lap(4,"a",59,40),lap(5,"a",58,50)]),
    {...group([lap(6,"b",70,15),lap(7,"b",69,25)]),route_id:4,route_name:"Solo Sprint"}];
  const events = M.activity(cats,drivers);
  assert.deepEqual(events.map(e=>[e.lap.lap_id,e.kind]),
    [[5,"extended"],[4,"takeover"],[3,"takeover"],[7,"unanswered"],[2,"closing"],[6,"first"],[1,"first"]]);
  assert.equal(events[1].rival.lap_id,3); assert.equal(events[1].margin,.5);
  assert.equal(events[4].margin,1);
  const board = M.scoreboard(cats,drivers);
  assert.equal(board.contested,1);
  assert.deepEqual(board.drivers.map(d=>[d.id,d.leads,d.unanswered]),[["b",0,1],["a",1,0]]);
  // an equalled time is a tie, never a lead change, whichever sorts first
  const tie = M.activity([group([lap(31,"a",60,10),lap(32,"b",59,20),lap(33,"a",59,30)])],drivers);
  assert.equal(tie.find(e=>e.lap.lap_id===33).kind,"tied");
  assert.deepEqual(tie.filter(e=>e.kind==="takeover").map(e=>e.lap.lap_id),[32]);
  // a later outright time after a tie is read against the holder the tie kept
  const after = M.activity([group([lap(31,"a",60,10),lap(32,"b",59,20),lap(33,"a",59,30),lap(34,"a",58,40)])],drivers);
  assert.deepEqual(after.filter(e=>e.kind==="takeover").map(e=>[e.lap.lap_id,e.rival.lap_id]),[[34,32],[32,31]]);
  const kept = M.activity([group([lap(31,"a",60,10),lap(32,"b",59,20),lap(33,"a",59,30),lap(35,"b",58,40)])],drivers);
  assert.deepEqual(kept.filter(e=>e.kind==="takeover").map(e=>e.lap.lap_id),[32]);
  assert.equal(kept.find(e=>e.lap.lap_id===35).kind,"extended");
  // both improve at once: the leader's margin is against the other's new best, as is Open
  const both2 = M.activity([group([lap(41,"a",60,10),lap(42,"b",61,15),lap(43,"a",58,20),lap(44,"b",59,20)])],drivers);
  const lead = both2.find(e=>e.lap.lap_id===43), chase = both2.find(e=>e.lap.lap_id===44);
  assert.equal(lead.kind,"extended");assert.equal(lead.margin,1);assert.equal(lead.rival.lap_id,44);
  assert.equal(chase.kind,"closing");assert.equal(chase.margin,1);
  // both improve at once while the holder stays fastest: the other only closed in
  const both = M.activity([group([lap(21,"a",60,10),lap(22,"a",58,20),lap(23,"b",59,20)])],drivers);
  assert.equal(both.some(e=>e.kind==="takeover"),false);
  const closed = both.find(e=>e.lap.lap_id===23);
  assert.equal(closed.kind,"closing");assert.equal(closed.rival.lap_id,22);assert.equal(closed.margin,1);
  // simultaneous finishes are one batch: no rival, no invented takeover, either order
  for (const ids of [[11,12],[12,11]]) {
    const same = M.activity([group([lap(ids[0],"a",60,10),lap(ids[1],"b",59,10)])],drivers);
    assert.deepEqual(same.map(e=>e.kind),["first","first"]);
  }
  assert.equal(M.ago(0,59*60000),"59 min ago");assert.equal(M.ago(0,3*3600000),"3 h ago");
  assert.equal(M.ago(0,5*86400000),"5 days ago");
});
test("the banner leads with the latest takeover, escapes names and opens that pair", async () => {
  const cats = [group([lap(1,"a",60,10),lap(2,"b",59,20),lap(3,"a",59.8,30)]),
    {...group([lap(4,"b",70,40)]),route_id:4,route_name:"<b>Solo</b>"}];
  const p = page({drivers,categories:cats});await p.settle();
  const html = p.elt("st-latest").innerHTML;
  assert.equal(p.elt("st-latest").hidden,false);
  assert.match(html,/Lead change[\s\S]*<strong>Blair<\/strong> took Test Circuit · A from Alex by <span class="st-time">1\.000 s/);
  assert.match(html,/href="replay\.html\?laps=2,1"/);
  assert.match(html,/<strong>Alex<\/strong> closed to <span class="st-time">0\.800 s<\/span> of Blair/);
  assert.match(html,/&lt;b&gt;Solo&lt;\/b&gt;/);assert.doesNotMatch(html,/<b>Solo/);
  assert.match(html,/waiting on Alex/);
  assert.match(html,/<strong>Blair<\/strong> leads 1 · <strong>Alex<\/strong> leads 0/);
  assert.match(html,/closest: Test Circuit · A,\s*<span class="st-time">0\.800 s/);
  // "Open" on the closing event selects its group with the new time as A and the rival's best as B
  const index = html.match(/closed to[\s\S]*?data-feed="(\d+)"/)[1];
  p.elt("st-latest").listeners.click({target:{closest:()=>({dataset:{feed:index}})}});
  assert.match(p.elt("st-inspector").innerHTML,/lap_a=3&lap_b=2/);
  assert.equal(p.elt("st-race-report").open,true);  // straight into the A vs B analysis
  // a first time with no rival keeps its own lap as A, against the other driver's best now
  const first = page({drivers,categories:[group([lap(1,"a",60,10),lap(2,"b",59,20),lap(3,"a",58,30)])]});await first.settle();
  const at = first.elt("st-latest").innerHTML.match(/<strong>Alex<\/strong> set the first time[\s\S]*?data-feed="(\d+)"/);
  assert.equal(at,null);  // superseded by Alex's newer takeover in the same group
  const solo = page({drivers,categories:[group([lap(1,"a",60,10)]),{...group([lap(2,"b",50,5),lap(4,"a",49,6)]),route_id:4}]});
  await solo.settle();
  const soloIndex = solo.elt("st-latest").innerHTML.match(/set the first time on Test Circuit · A[\s\S]*?data-feed="(\d+)"/)[1];
  solo.elt("st-latest").listeners.click({target:{closest:()=>({dataset:{feed:soloIndex}})}});
  assert.match(solo.elt("st-inspector").innerHTML,/lap 1</);
  assert.match(solo.elt("st-inspector").innerHTML,/Choose a completed lap/);
  // estimated finishes stay marked in the stories
  const sprint = page({drivers,categories:[group([lap(1,"a",60,10,{finish:"last_packet"}),lap(2,"b",59,20)])]});await sprint.settle();
  assert.match(sprint.elt("st-latest").innerHTML,/1\.000 s<\/span> <abbr class="st-est"/);
  assert.match(sprint.elt("st-latest").innerHTML,/closest: Test Circuit · A,\s*<span class="st-time">1\.000 s<\/span> <abbr class="st-est"/);
  // a record set after the headline takeover still shows
  const later = page({drivers,categories:[group([lap(1,"a",60,10),lap(2,"b",59,20),lap(3,"a",58,30),lap(4,"a",57,40)])]});
  await later.settle();
  assert.match(later.elt("st-latest").innerHTML,/Lead change[\s\S]*Alex<\/strong> took/);
  assert.match(later.elt("st-latest").innerHTML,/Alex<\/strong> extended the lead on Test Circuit · A to <span class="st-time">2\.000 s/);
  const quiet = page({drivers,categories:[]});await quiet.settle();
  assert.equal(quiet.elt("st-latest").hidden,true);
});
