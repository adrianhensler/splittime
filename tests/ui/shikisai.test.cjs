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
test("every film and poster the page names is shipped, and each film can seek before it has downloaded", () => {
  const fs = require("node:fs"), stat = path.join(__dirname, "../../app/static");
  const html = fs.readFileSync(path.join(stat, "shikisai.html"), "utf8");
  const videos = [...html.matchAll(/<video\b[^>]*>/g)].map(m => m[0]);
  assert.equal(videos.length, 3);
  for (const v of videos) {
    assert.match(v, /\bcontrols\b/); assert.match(v, /preload="none"/); assert.match(v, /aria-label="[^"]+"/);
    assert.ok(fs.existsSync(path.join(stat, v.match(/poster="([^"]+)"/)[1])), v);
  }
  const films = [...html.matchAll(/<source src="([^"]+)" type="video\/mp4">/g)].map(m => m[1]);
  assert.deepEqual(films, ["media/shikisai/roadside.mp4", "media/shikisai/race.mp4", "media/shikisai/announcer.mp4"]);
  for (const f of films) {
    // top-level boxes in order: the index (moov) must come before the media (mdat)
    const d = fs.readFileSync(path.join(stat, f)), boxes = [];
    for (let o = 0; o < d.length;) {
      let size = d.readUInt32BE(o); boxes.push(d.toString("latin1", o + 4, o + 8));
      if (size === 1) size = Number(d.readBigUInt64BE(o + 8));
      assert.ok(size >= 8, f); o += size;
    }
    assert.ok(boxes.indexOf("moov") >= 0 && boxes.indexOf("moov") < boxes.indexOf("mdat"), `${f}: ${boxes}`);
  }
});
test("the announcer version sits closed under the full film, with English captions and its prompts", () => {
  const fs = require("node:fs"), stat = path.join(__dirname, "../../app/static");
  const html = fs.readFileSync(path.join(stat, "shikisai.html"), "utf8");
  const block = html.match(/<details class="[^"]*\bsk-announcer\b[^"]*">([\s\S]*?)<\/details>/);
  assert.ok(block, "announcer details block");
  assert.ok(html.indexOf("media/shikisai/race.mp4") < block.index, "after the full film");
  assert.doesNotMatch(block[0], /<details[^>]*\bopen\b/);
  assert.match(block[1], /<summary>Hear the opening with a race announcer \(45 seconds\)<\/summary>/);
  const track = block[1].match(/<track\b[^>]*>/)[0];
  assert.match(track, /kind="captions"/); assert.match(track, /srclang="en"/); assert.match(track, /label="English"/);
  const vtt = fs.readFileSync(path.join(stat, track.match(/src="([^"]+)"/)[1]), "utf8");
  assert.match(vtt, /^WEBVTT\n/);
  // the last spoken caption ends at 0:32.30; only the engines after that
  const cues = [...vtt.matchAll(/^(\d\d):(\d\d):(\d\d\.\d{3}) --> (\d\d):(\d\d):(\d\d\.\d{3})\n(.+)/gm)]
    .map(m => ({ end: +m[4] * 3600 + +m[5] * 60 + +m[6], text: m[7] }));
  const spoken = cues.filter(c => !c.text.startsWith("["));
  assert.equal(spoken.at(-1).text, "Fish takes the lead!");
  assert.ok(spoken.at(-1).end <= 32.32, String(spoken.at(-1).end));
  // both prompts are quoted as given, delivery cues included
  for (const p of ["[excited] And they're away at Shikisai!", "Watch that teal car into turn two.",
    "[excited] Fish in fifth on the way in. [pause] Fourth! Third! [pause] He's alongside! Second! [excited] Fish takes the lead!"])
    assert.ok(html.includes(p), p);
  assert.match(html, /Eleven v4 model \(<code>eleven_v4<\/code>\)/);
});
