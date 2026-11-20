"use strict";
/* Eighteen runs at Shikisai: the story page's fixed snapshot (20 November
   2026). Every finished Shikisai Sprint run driven in the 2016 Aston Martin
   Vulcan (S2 884), so all of them are comparable. The page states figures
   from this list; tests/ui/shikisai.test.cjs checks those figures against it,
   so the words and the data can't drift apart. Traces still come live from
   api/laps/{id}/data. */
(function (root) {
  const DRIVERS = {
    f: {id: "fishfighterns", name: "FishFighterNS"},
    c: {id: "captn-compass", name: "Captn Compass"},
  };
  // [lap id, driver, recorded time s, lap started (UTC), flags]
  // flags: "cutoff" = the game stopped sending at the line, so the time was
  // worked out from the clock and distance; "contact" = hit something
  const RUNS = [
    [66, "c", 139.971, "2026-10-15T04:39:20Z", "cutoff"],
    [92, "f", 128.490, "2026-10-16T18:32:33Z", "cutoff"],
    [336, "c", 129.405, "2026-11-05T02:19:02Z", "cutoff"],
    [338, "c", 124.306, "2026-11-05T02:21:48Z", "cutoff"],
    [340, "c", 130.802, "2026-11-05T02:24:29Z", "contact"],
    [342, "c", 126.719, "2026-11-05T02:27:09Z", "cutoff"],
    [344, "c", 130.844, "2026-11-05T02:29:52Z", "contact"],
    [346, "c", 126.448, "2026-11-05T02:32:25Z", "cutoff"],
    [348, "c", 131.786, "2026-11-05T02:35:11Z", "contact"],
    [350, "c", 129.978, "2026-11-05T02:37:45Z", ""],
    [352, "c", 130.050, "2026-11-05T02:40:16Z", "contact"],
    [354, "c", 125.090, "2026-11-05T02:42:47Z", "cutoff"],
    [356, "c", 126.582, "2026-11-05T02:45:34Z", "contact"],
    [358, "c", 124.566, "2026-11-05T02:48:05Z", "cutoff"],
    [361, "c", 122.493, "2026-11-05T02:52:36Z", "cutoff"],
    [363, "c", 126.426, "2026-11-05T02:55:16Z", "contact,cutoff"],
    [424, "f", 122.911, "2026-11-05T11:46:36Z", "cutoff"],
    [428, "f", 120.718, "2026-11-05T11:53:12Z", "cutoff"],
  ].map(([id, d, time, started, flags]) => ({id, driver: d, name: DRIVERS[d].name, time, started,
    flags: flags ? flags.split(",") : []}));

  const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
  function median(xs) {
    const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  /* One driver's figures, as the page states them. */
  function summary(driver, runs = RUNS) {
    const mine = runs.filter(r => r.driver === driver), t = mine.map(r => r.time);
    const avg = mean(t);
    return {runs: mine.length, best: Math.min(...t), worst: Math.max(...t), mean: avg, median: median(t),
      spread: Math.sqrt(mean(t.map(v => (v - avg) ** 2))),
      contact: mine.filter(r => r.flags.includes("contact")).length,
      estimated: mine.filter(r => r.flags.includes("cutoff")).length};
  }
  /* Runs in the order they were driven, for the night-shift story. */
  const byDate = (driver, runs = RUNS) => runs.filter(r => r.driver === driver)
    .sort((a, b) => a.started.localeCompare(b.started));

  const model = {DRIVERS, RUNS, summary, byDate, mean, median};
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  else root.ShikisaiData = model;
})(globalThis);
