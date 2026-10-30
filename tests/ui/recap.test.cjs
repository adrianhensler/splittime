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
    personal_bests:[{driver:"<img src=x>",route:"Ito Sprint",class:"S2",time_s:162.379,estimated_finish:true,previous_time_s:172.709,previous_estimated_finish:false,improved_s:10.33},
      {driver:"FishFighterNS",route:"Oka CCC",class:"A",time_s:62.25}],
    records_changed:[{route:"Ito Sprint",class:"S2",new_holder:"<img src=x>",previous_holder:"FishFighterNS",time_s:162.379,estimated_finish:true,previous_estimated_finish:false,margin_s:4.751}],
    busiest_route:{route:"Daikoku Circuit",class:"S1",laps:12}},
  ai:{state:"missing",enabled:true,budget:{remaining_usd:0.9}},...extra});
test("measured week: escaped names, times as m:ss, standings that moved",()=>{
  const html=R.html({weeks:[week()]});
  assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img src=x&gt;/);
  assert.match(html,/2:42.379<\/span> <abbr class="st-est"[^>]*>est.<\/abbr> · 10.330 s quicker than 2:52.709<\/li>/);
  assert.match(html,/Oka CCC \(A\) · <span class="st-time">1:02.250<\/span> · first time/);
  assert.match(html,/0 → 1/);assert.match(html,/est.<\/abbr>, by 4.751 s \(from an estimated time\)/);
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
test("within reach: gap, estimated record, and links to where the gap is",()=>{
  const reach={driver:"FishFighterNS",route:"<b>Ito</b> Sprint",class:"S2",holder:"<img src=x>",time_s:167.13,
    estimated_finish:false,record_time_s:162.379,record_estimated_finish:true,gap_s:4.751};
  const w=week();w.facts.within_reach=[reach,{...reach,route:"Oka CCC"}];w.reach_laps=[[98,174],["1\"><script>",2]];
  const html=R.html({weeks:[w]});
  assert.match(html,/<h3>Within reach<\/h3>/);
  assert.match(html,/&lt;b&gt;Ito&lt;\/b&gt; Sprint \(S2\) · <span class="st-time">2:47.130<\/span>,\s+4.751 s off &lt;img src=x&gt;’s <span class="st-time">2:42.379<\/span> <abbr class="st-est"/);
  assert.match(html,/href="rivalry-v2.html\?laps=98,174#st-analysis">Where the gap is<\/a> · <a href="replay.html\?laps=98,174">Replay/);
  assert.doesNotMatch(html,/<script>|laps=1/);  // only whole lap ids make a link
  assert.doesNotMatch(R.html({weeks:[week()]}),/Within reach/);  // older weeks have none
});
test("milestones: new routes grouped, the longest run, first time ahead; unknown kinds skipped",()=>{
  const w=week({milestones:[
    {kind:"new_route",driver:"<img src=x>",route:"Ito Sprint"},
    {kind:"pb_streak",driver:"FishFighterNS",sessions:3},
    {kind:"laps",driver:"FishFighterNS",count:52},
    {kind:"new_route",driver:"<img src=x>",route:"<b>Oka</b> CCC"},
    {kind:"pb_streak",driver:"FishFighterNS",sessions:4},
    {kind:"pb_streak",driver:"FishFighterNS",sessions:3},  // Codex, #60: a later, shorter run
    {kind:"first_ahead",driver:"FishFighterNS",route:"Ito Sprint",class:"S2",time_s:162.379,estimated_finish:true,
      over:"<img src=x>",over_time_s:167.13,over_estimated_finish:false,margin_s:4.751},
    {kind:"from_the_future",driver:"Nobody"}]});
  const html=R.html({weeks:[w]});
  assert.match(html,/<h3>Milestones<\/h3>/);
  assert.match(html,/&lt;img src=x&gt;<\/strong> · first laps on Ito Sprint, &lt;b&gt;Oka&lt;\/b&gt; CCC<\/li>/);
  assert.match(html,/FishFighterNS<\/strong> · a personal best in 4 sessions running/);
  assert.doesNotMatch(html,/in 3 sessions running|Nobody/);
  assert.match(html,/FishFighterNS<\/strong> · 52nd lap/);
  assert.match(html,/ahead on Ito Sprint \(S2\) for the first time, <span class="st-time">2:42.379<\/span> <abbr class="st-est"[^>]*>est.<\/abbr> to &lt;img src=x&gt;’s <span class="st-time">2:47.130<\/span><\/li>/);
  assert.doesNotMatch(R.html({weeks:[week()]}),/Milestones/);
});
