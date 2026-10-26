"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), path = require("node:path");
const root = path.join(__dirname,"../..");
globalThis.RivalryModel = require(path.join(root,"app/static/js/rivalry-v2-model.js"));
const P = require(path.join(root,"app/static/js/pair-bar.js"));
const lap = (id,name,time,extra={}) => ({lap_id:id,driver_name:name,time_s:time,...extra});
const cats = [{route_name:"Ito <Sprint>",car_class_label:"S2",
  attempts:[lap(174,"Captn Compass",162.379,{finish:"last_packet"}),lap(98,"<img src=x>",167.13)]}];

test("one URL shape for a pair, with the older lap_a/lap_b still read", () => {
  assert.deepEqual(P.parse("?laps=174,98"),[174,98]);
  assert.deepEqual(P.parse("?lap_a=174&lap_b=98"),[174,98]);
  for (const bad of ["","?laps=174","?laps=1,2,3","?laps=5,5","?laps=0,2","?laps=a,2","?lap_a=<script>&lap_b=2"])
    assert.equal(P.parse(bad),null,bad);
  assert.equal(P.href("report",1,2),"rivalry-v2.html?laps=1,2#st-analysis");
  assert.equal(P.href("traces",1,2),"compare.html?laps=1,2");
  assert.equal(P.href("replay",1,2),"replay.html?laps=1,2");
});
test("every view links the same pair; the current one is marked, swap stays on it", () => {
  const html = P.html(cats,174,98,"traces");
  assert.match(html,/<span aria-current="page">Traces &amp; corners<\/span>/);
  assert.match(html,/href="rivalry-v2\.html\?laps=174,98#st-analysis">Race report/);
  assert.match(html,/href="replay\.html\?laps=174,98">Replay/);
  assert.match(html,/class="st-pair-swap" href="compare\.html\?laps=98,174"/);
  assert.match(html,/Captn Compass<\/strong> <span class="st-time">2:42\.379<\/span> <abbr class="st-est"/);
  assert.match(html,/Ito &lt;Sprint&gt; · S2/);
  assert.match(html,/&lt;img src=x&gt;/);assert.doesNotMatch(html,/<img/);
  assert.match(html,/href="rivalry-v2\.html">← Rivalry/);
});
test("on Rivalry itself there is no reload swap or back link; unknown laps still link by number", () => {
  const html = P.html(cats,174,98,"report",{inPage:true});
  assert.doesNotMatch(html,/st-pair-swap|st-pair-back/);
  assert.match(html,/<span aria-current="page">Race report<\/span>/);
  assert.match(P.html([],5,6,"replay"),/Lap 5 .*vs Lap 6/s);
});
test("mount fills each host from the address bar, and does nothing without a pair", async () => {
  const host = {dataset:{pairBar:"replay"},hidden:true,innerHTML:""};
  const doc = {querySelectorAll:() => [host]}, calls = [];
  const fetcher = async url => {calls.push(url);return {ok:true,json:async()=>({categories:cats})};};
  await P.mount(doc,"?laps=1,2,3",fetcher);
  assert.equal(calls.length,0);assert.equal(host.hidden,true);
  await P.mount(doc,"?laps=174,98",fetcher);
  assert.deepEqual(calls,["api/rivalry"]);assert.equal(host.hidden,false);
  assert.match(host.innerHTML,/aria-current="page">Replay/);
  await P.mount(doc,"?laps=174,98",async () => {throw new Error("offline");});
  assert.match(host.innerHTML,/Lap 174/);
});
