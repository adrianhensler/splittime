"use strict";
const {test} = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm");
const context = {};vm.createContext(context);
vm.runInContext(fs.readFileSync("app/static/js/recap.js","utf8"),context);
const R = context.Recap;
const week = (extra={}) => ({week:"2026-10-19",last_day:"2026-10-25",complete:true,
  tags:{D1:"<img src=x>",D2:"FishFighterNS",R1:"Ito Sprint"},
  facts:{laps:32,clean_laps:11,sessions:12,routes:10,contested_routes:4,
    drivers:[{driver:"<img src=x>",laps:27,clean_laps:9,sessions:7,routes:6,new_routes:4,personal_bests:4,records_held_before:0,records_held:1}],
    personal_bests:[{driver:"<img src=x>",route:"Ito Sprint",class:"S2",time_s:162.379,previous_time_s:172.709,improved_s:10.33},
      {driver:"FishFighterNS",route:"Oka CCC",class:"A",time_s:62.25}],
    records_changed:[{route:"Ito Sprint",class:"S2",new_holder:"<img src=x>",previous_holder:"FishFighterNS",time_s:162.379,margin_s:4.751}],
    busiest_route:{route:"Daikoku Circuit",class:"S1",laps:12}},
  ai:{state:"missing",enabled:true,budget:{remaining_usd:0.9}},...extra});
test("measured week: escaped names, times as m:ss, standings that moved",()=>{
  const html=R.html({weeks:[week()]});
  assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img src=x&gt;/);
  assert.match(html,/2:42.379<\/span> · 10.330 s quicker than 2:52.709/);
  assert.match(html,/Oka CCC \(A\) · <span class="st-time">1:02.250<\/span> · first time/);
  assert.match(html,/0 → 1/);assert.match(html,/by 4.751 s/);
  assert.match(html,/data-recap="2026-10-19" data-retry="false" >Write AI recap/);
});
test("the column fills placeholders after escaping; the current week has no button",()=>{
  const ready=week({ai:{state:"ready",enabled:true,cost_or_reserved_usd:.0012,budget:{remaining_usd:.9},narrative:{
    headline:"{D1} takes {R1}",story:"{D2} <b>lost</b> it; {X9} is unknown.",highlights:["{R1}: 4.751 s."],next_week:"Win {R1} back."}}});
  const html=R.html({weeks:[week({week:"2026-10-26",last_day:"2026-11-01",complete:false}),ready]});
  assert.match(html,/<strong>&lt;img src=x&gt;<\/strong> takes <strong>Ito Sprint<\/strong>/);
  assert.match(html,/<strong>FishFighterNS<\/strong> &lt;b&gt;lost&lt;\/b&gt; it; \{X9\} is unknown/);
  assert.match(html,/Next week ·<\/span> Win <strong>Ito Sprint<\/strong> back/);
  assert.match(html,/This week so far/);assert.match(html,/its recap is written once it ends/);
  assert.equal((html.match(/data-recap=/g)||[]).length,0);
  const failed=R.html({weeks:[week({ai:{state:"failed",enabled:true,budget:{remaining_usd:.9}}})]});
  assert.match(failed,/data-retry="true" >Retry AI recap/);
  const broke=R.html({weeks:[week({ai:{state:"missing",enabled:true,budget:{remaining_usd:.005}}})]});
  assert.match(broke,/data-retry="false" disabled>Write AI recap/);
});
