"use strict";
// The "Every run" story page: one native film, a closed making-of note, the
// figures it quotes, and links to it from the pages that introduce stories.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const stat = path.join(__dirname, "../../app/static");
const html = fs.readFileSync(path.join(stat, "every-run.html"), "utf8");

test("one native film with a poster, loading nothing until played, that can seek before it has downloaded", () => {
  const videos = [...html.matchAll(/<video\b[^>]*>/g)].map(m => m[0]);
  assert.equal(videos.length, 1);
  const v = videos[0];
  for (const attr of [/\bcontrols\b/, /\bplaysinline\b/, /preload="none"/, /aria-label="[^"]+"/, /aria-describedby="er-film-caption"/])
    assert.match(v, attr);
  assert.ok(fs.existsSync(path.join(stat, v.match(/poster="([^"]+)"/)[1])));
  assert.match(html, /<figcaption id="er-film-caption">/);
  const src = html.match(/<source src="([^"]+)" type="video\/mp4">/)[1];
  assert.equal(src, "media/every-run/every-run.mp4");
  const d = fs.readFileSync(path.join(stat, src)), boxes = [];
  for (let o = 0; o < d.length;) {
    let size = d.readUInt32BE(o); boxes.push(d.toString("latin1", o + 4, o + 8));
    if (size === 1) size = Number(d.readBigUInt64BE(o + 8));
    assert.ok(size >= 8); o += size;
  }
  assert.ok(boxes.indexOf("moov") >= 0 && boxes.indexOf("moov") < boxes.indexOf("mdat"), String(boxes));
});

test("a closed 'How we made the film' note sits right under the film", () => {
  const film = html.indexOf("</figure>");
  const note = html.match(/<details class="[^"]*">\s*<summary>How we made the film<\/summary>([\s\S]*?)<\/details>/);
  assert.ok(note, "making-of details");
  assert.ok(note.index > film && html.slice(film, note.index).trim() === "</figure>", "directly after the film");
  assert.doesNotMatch(note[0], /<details[^>]*\bopen\b/);
  for (const fact of ["ten times a second", "about sixty readings a second", "which way the car was pointing",
    "smoothed slightly", "Blender", "illustrations", "original and synthesized"])
    assert.ok(note[1].includes(fact), fact);
});

test("figures quoted on the page", () => {
  for (const fact of ["299 laps on 38 routes", "127 runs", "172 runs", "7 hours 42 minutes 53 seconds",
    "39.888 seconds", "three thousandths of a second apart, for second and third"])
    assert.ok(html.includes(fact), fact);
  assert.doesNotMatch(html, /announcer|<track\b/i);
  assert.match(html, /href="replay\.html\?laps=587,755,751,760"/);
});

test("linked from How it works, the Shikisai story and What's new", () => {
  for (const page of ["how-it-works.html", "shikisai.html", "whats-new.html"])
    assert.match(fs.readFileSync(path.join(stat, page), "utf8"), /href="every-run\.html"/, page);
});
