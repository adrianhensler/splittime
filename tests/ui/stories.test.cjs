"use strict";
// The Stories page: one card per story page or film, and a Stories link in
// the menu of every page that has one.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const stat = path.join(__dirname, "../../app/static");
const html = fs.readFileSync(path.join(stat, "stories.html"), "utf8");

test("a card for each story page and film, with images that exist", () => {
  const hrefs = [...html.matchAll(/<a class="sy-card" href="([^"]+)"/g)].map(m => m[1]);
  for (const page of ["every-run.html", "shikisai.html", "three-laps.html"]) {
    assert.ok(hrefs.includes(page), page);
    assert.ok(fs.existsSync(path.join(stat, page)), page);
  }
  assert.ok(hrefs.some(h => h.endsWith("/SplitTime-Redline-V12.mp4")));
  assert.ok(hrefs.includes("https://test.hensler.work/splittime-reel/"));
  for (const [, src] of html.matchAll(/<img[^>]*src="([^"]+)"/g))
    assert.ok(fs.existsSync(path.join(stat, src)), src);
});

test("every page with a site menu links to Stories, marked current only on Stories", () => {
  for (const page of fs.readdirSync(stat).filter(f => f.endsWith(".html"))) {
    const src = fs.readFileSync(path.join(stat, page), "utf8");
    if (!src.includes('href="how-it-works.html">How it works') && !src.includes('aria-current="page">How it works')) continue;
    const link = src.match(/<a href="stories\.html"( aria-current="page")?>Stories<\/a>/);
    assert.ok(link, page);
    assert.equal(Boolean(link[1]), page === "stories.html", page);
  }
});
