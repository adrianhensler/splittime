"use strict";
// The Shikisai story page states these figures in its text; they must match
// the snapshot the page is built from.
const test = require("node:test"), assert = require("node:assert/strict"), path = require("node:path");
const S = require(path.join(__dirname, "../../app/static/js/shikisai-data.js"));
const r3 = v => Math.round(v * 1000) / 1000, r2 = v => Math.round(v * 100) / 100;

test("eighteen runs, every one a distinct lap: 3 by FishFighterNS, 15 by Captn Compass", () => {
  assert.equal(S.RUNS.length, 18);
  assert.equal(new Set(S.RUNS.map(r => r.id)).size, 18);
  assert.equal(S.summary("f").runs, 3); assert.equal(S.summary("c").runs, 15);
});
test("bests and averages as the page states them", () => {
  const f = S.summary("f"), c = S.summary("c");
  assert.equal(f.best, 120.718); assert.equal(c.best, 122.493);
  assert.equal(r2(f.mean), 124.04); assert.equal(r2(c.mean), 128.36);
  assert.equal(r3(f.best - c.best), -1.775);
});
test("contact: none for FishFighterNS, 6 for Captn Compass; 12 times estimated at the line", () => {
  assert.equal(S.summary("f").contact, 0); assert.equal(S.summary("c").contact, 6);
  assert.equal(S.summary("f").estimated + S.summary("c").estimated, 12);
  assert.equal(S.RUNS.filter(r => !r.flags.length).length, 1);
});
test("the night shift: 14 runs in 36 minutes, best on the 13th, about 2 s quicker by the end", () => {
  const night = S.byDate("c").filter(r => r.started.startsWith("2026-11-05"));
  assert.equal(night.length, 14);
  const minutes = (Date.parse(night[13].started) - Date.parse(night[0].started)) / 60000;
  assert.equal(Math.round(minutes), 36);
  const t = night.map(r => r.time);
  assert.equal(t.indexOf(Math.min(...t)) + 1, 13);
  assert.equal(r2(S.mean(t.slice(0, 7))), 128.62); assert.equal(r2(S.mean(t.slice(7))), 126.46);
});
test("FishFighterNS's two runs came about nine hours after the last one", () => {
  const night = S.byDate("c").filter(r => r.started.startsWith("2026-11-05"));
  const fish = S.byDate("f").filter(r => r.started.startsWith("2026-11-05"));
  assert.equal(fish.length, 2);
  const hours = (Date.parse(fish[0].started) - Date.parse(night[night.length - 1].started)) / 3600000;
  assert.ok(hours > 8.5 && hours < 9.5, String(hours));
  assert.equal(fish[1].time, 120.718);
});
