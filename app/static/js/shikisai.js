"use strict";
/* Eighteen runs at Shikisai: the overhead ghost race and the lap-time chart.
   Every run leaves the line together. They were driven on different days, so
   nobody could see anybody else; it is a ghost race. Built on ReplayModel
   (car, at, standings, bounds, projector), so positions and places are worked
   out exactly as on the Replay page. */
(function () {
  const R = globalThis.ReplayModel, M = globalThis.RivalryModel, S = globalThis.ShikisaiData;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch =>
    ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[ch]));
  const TRAIL = 2.5;   // seconds of trail behind each dot

  // theme colours are light-dark(...); a canvas needs them resolved first
  const probe = document.createElement("span");
  probe.hidden = true; document.body.append(probe);
  const css = name => { probe.style.color = `var(${name})`; return getComputedStyle(probe).color; };
  const colour = driver => css(driver === "f" ? "--sk-fish" : "--sk-captn");

  const canvas = $("gr-canvas"), ctx = canvas.getContext("2d");
  const state = {cars: [], time: 0, playing: false, speed: 2, last: null, duration: 0, box: null,
    order: "", road: [], cam: "pack", eye: null};
  const say = text => { $("gr-status").textContent = text; };

  async function load() {
    say("Loading 18 runs…");
    const loaded = await Promise.all(S.RUNS.map(async run => {
      const res = await fetch(`api/laps/${run.id}/data?channels=pos_x,pos_y,pos_z,speed_kmh,lap_time&max_points=1500`);
      if (!res.ok) throw new Error(`lap ${run.id}: HTTP ${res.status}`);
      return [run, await res.json()];
    }));
    state.cars = loaded.filter(([, d]) => d.t.length > 1).map(([run, data], i) => {
      const car = R.car(data, {time_s: run.time, driver_name: run.name}, i);
      car.run = run;
      return car;
    });
    state.duration = Math.max(...state.cars.map(c => c.duration));
    state.box = R.bounds(state.cars);
    // the road: the fastest run's line, drawn once under everyone
    const best = state.cars.reduce((a, b) => (b.duration < a.duration ? b : a));
    state.road = best.t.map((_, i) => [best.channels.pos_x[i], best.channels.pos_z[i]]);
    say(state.cars.length === S.RUNS.length ? "" : `${S.RUNS.length - state.cars.length} runs could not be loaded.`);
    $("gr-stage").hidden = false;
    resize(); board(true);
  }

  /* Whole road: everything in view. Follow the pack: frame the cars, at
     least PACK metres across, eased so the picture doesn't jitter. */
  const PACK = 380;
  function view() {
    const w = canvas.clientWidth, h = canvas.clientHeight, b = state.box, pad = 28;
    let want = {cx: b.cx, cz: b.cz, sx: b.maxX - b.minX || 1, sz: b.maxZ - b.minZ || 1};
    if (state.cam === "pack") {
      const pts = state.cars.map(c => R.at(c, state.time)).filter(p => !p.finished);
      const use = pts.length ? pts : state.cars.map(c => R.at(c, state.time));
      const xs = use.map(p => p.x), zs = use.map(p => p.z);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
      want = {cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, sx: Math.max(x1 - x0, PACK), sz: Math.max(z1 - z0, PACK)};
    }
    const scale = Math.min((w - 2 * pad) / want.sx, (h - 2 * pad) / want.sz);
    const e = state.eye, k = state.playing && e && state.cam === "pack" ? 0.08 : 1;
    state.eye = e ? {cx: e.cx + (want.cx - e.cx) * k, cz: e.cz + (want.cz - e.cz) * k, scale: e.scale + (scale - e.scale) * k}
      : {cx: want.cx, cz: want.cz, scale};
    return R.projector({cx: state.eye.cx, cz: state.eye.cz, cy: 0, yaw: 0, pitch: 0, anchor: 0.5, panX: 0, panY: 0, relief: 1,
      scale: state.eye.scale}, w, h);
  }

  function draw() {
    const w = canvas.clientWidth, h = canvas.clientHeight, proj = view();
    ctx.clearRect(0, 0, w, h);
    ctx.lineJoin = ctx.lineCap = "round";
    // the road, wide and quiet
    ctx.beginPath();
    state.road.forEach(([x, z], i) => { const [px, py] = proj(x, 0, z); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
    ctx.strokeStyle = css("--st-line"); ctx.lineWidth = Math.max(9, Math.min(26, 12 * state.eye.scale)); ctx.stroke();
    // start and finish
    for (const [label, [x, z]] of [["Start", state.road[0]], ["Finish", state.road[state.road.length - 1]]]) {
      const [px, py] = proj(x, 0, z);
      ctx.fillStyle = css("--st-muted"); ctx.font = "600 12px system-ui, sans-serif";
      ctx.fillText(label, px + 10, py + 4);
    }
    const ring = css("--st-panel");
    // slowest first, so the quickest runs sit on top where they bunch up
    const cars = [...state.cars].sort((a, b) => b.duration - a.duration);
    for (const car of cars) {
      const col = colour(car.run.driver), now = Math.min(state.time, car.duration);
      ctx.beginPath();
      for (let k = 0, t0 = Math.max(0, now - TRAIL); k <= 12; k++) {
        const s = R.at(car, t0 + (now - t0) * k / 12), [px, py] = proj(s.x, 0, s.z);
        if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.strokeStyle = col; ctx.globalAlpha = 0.45; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1;
    }
    for (const car of cars) {
      const s = R.at(car, state.time), [px, py] = proj(s.x, 0, s.z);
      ctx.beginPath(); ctx.arc(px, py, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = colour(car.run.driver); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = ring; ctx.stroke();
    }
    // name each driver's leading run, so the colours never need the legend
    const seen = new Set();
    for (const row of R.standings(state.cars, state.time)) {
      const d = row.car.run.driver;
      if (seen.has(d)) continue;
      seen.add(d);
      const s = R.at(row.car, state.time), [px, py] = proj(s.x, 0, s.z);
      ctx.font = "600 12px system-ui, sans-serif"; ctx.fillStyle = css("--st-fg");
      ctx.fillText(row.car.run.name, px + 9, py + (d === "f" ? -8 : 16));
    }
    $("gr-clock").textContent = `${M.time(Math.max(state.time, 0.0005))} / ${M.time(state.duration)}`;
    if (document.activeElement !== $("gr-scrub")) $("gr-scrub").value = String(Math.round(1000 * state.time / state.duration));
    board();
  }

  /* The order beside the map: finished runs by time, the rest by how far
     along they are. Rewritten only when something changes. */
  function board(force) {
    const rows = R.standings(state.cars, state.time);
    const key = rows.map(r => `${r.car.id}:${r.state.finished ? 1 : 0}`).join(",");
    if (!force && key === state.order) {
      rows.forEach(r => {
        const gap = $(`gr-gap-${r.car.id}`);
        const text = r.state.finished ? M.time(r.car.duration) : r.place === 1 ? "Ahead" : `+${r.gap.toFixed(1)} s`;
        if (gap && gap.textContent !== text) gap.textContent = text;
      });
      return;
    }
    state.order = key;
    $("gr-board").innerHTML = rows.map(r => {
      const run = r.car.run, done = r.state.finished;
      const gap = done ? M.time(r.car.duration) : r.place === 1 ? "Ahead" : `+${r.gap.toFixed(1)} s`;
      return `<li class="${done ? "gr-done" : ""}"><span class="gr-place">${r.place}</span>` +
        `<span class="sk-dot sk-${run.driver}" aria-hidden="true"></span>` +
        `<span class="gr-name">${esc(run.name)}</span><span class="gr-gap" id="gr-gap-${run.id}">${gap}</span></li>`;
    }).join("");
  }

  function frame(now) {
    if (!state.playing) return;
    const dt = state.last === null ? 0 : Math.min(0.1, (now - state.last) / 1000);
    state.last = now; state.time += dt * state.speed;
    if (state.time >= state.duration) { state.time = state.duration; play(false); }
    draw();
    if (state.playing) requestAnimationFrame(frame);
  }
  function play(on) {
    if (on && state.time >= state.duration) state.time = 0;
    state.playing = on; state.last = null;
    $("gr-play").textContent = on ? "Pause" : "Play";
    if (on) requestAnimationFrame(frame);
  }
  function resize() {
    const r = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvas.clientWidth * r); canvas.height = Math.round(canvas.clientHeight * r);
    ctx.setTransform(r, 0, 0, r, 0, 0);
    state.eye = null;
    if (state.box) draw();
  }

  $("gr-play").addEventListener("click", () => play(!state.playing));
  for (const [id, cam] of [["gr-cam-pack", "pack"], ["gr-cam-road", "road"]]) $(id).addEventListener("click", () => {
    state.cam = cam; state.eye = null;
    $("gr-cam-pack").setAttribute("aria-pressed", String(cam === "pack"));
    $("gr-cam-road").setAttribute("aria-pressed", String(cam === "road"));
    if (state.box) draw();
  });
  $("gr-restart").addEventListener("click", () => { state.time = 0; play(true); });
  $("gr-speed").addEventListener("change", e => { state.speed = Number(e.target.value); });
  $("gr-scrub").addEventListener("input", e => { state.time = state.duration * Number(e.target.value) / 1000; draw(); });
  window.addEventListener("resize", resize);
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { if (state.box) draw(); });

  // ---- lap times: one row per driver, a dot per run ----------------------------
  function strip() {
    const box = $("sk-strip"), tip = $("sk-tip");
    const lo = 120, hi = 140, W = 640, H = 150, left = 118, right = 14, rowY = {f: 52, c: 104};
    const x = t => left + (Math.min(Math.max(t, lo), hi) - lo) / (hi - lo) * (W - left - right);
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="sk-strip-title">` +
      `<title id="sk-strip-title">Lap times of all 18 runs, by driver. The table below lists them.</title>`;
    for (let t = lo; t <= hi; t += 5) {
      svg += `<line class="sk-grid" x1="${x(t)}" x2="${x(t)}" y1="24" y2="${H - 22}"/>` +
        `<text class="sk-axis" x="${x(t)}" y="${H - 6}" text-anchor="middle">${M.time(t).replace(/\.000$/, "")}</text>`;
    }
    svg += `<text class="sk-axis" x="${W - right}" y="14" text-anchor="end">quicker ← lap time → slower</text>`;
    for (const d of ["f", "c"]) {
      const sum = S.summary(d), y = rowY[d];
      svg += `<text class="sk-row" x="0" y="${y + 4}">${esc(S.DRIVERS[d].name)}</text>` +
        `<line class="sk-mean" x1="${x(sum.mean)}" x2="${x(sum.mean)}" y1="${y - 14}" y2="${y + 14}"/>` +
        `<text class="sk-note" x="${x(sum.mean) + 4}" y="${y + 24}">average ${M.time(sum.mean)}</text>`;
      for (const run of S.RUNS.filter(r => r.driver === d)) {
        const label = `${run.name} · ${M.time(run.time)} · ${M.date(run.started)}${run.flags.includes("contact") ? " · contact" : ""}`;
        svg += `<g class="sk-hit" tabindex="0" data-tip="${esc(label)}"><circle class="sk-target" cx="${x(run.time)}" cy="${y}" r="11"/>` +
          `<circle class="sk-mark sk-${d}" cx="${x(run.time)}" cy="${y}" r="6"/></g>`;
      }
      svg += `<text class="sk-note" x="${x(sum.best)}" y="${y - 12}" text-anchor="middle">best ${M.time(sum.best)}</text>`;
    }
    box.innerHTML = svg + "</svg>";
    const show = el => {
      const r = el.getBoundingClientRect(), host = box.getBoundingClientRect();
      tip.textContent = el.dataset.tip; tip.hidden = false;
      tip.style.left = `${Math.min(r.left - host.left + r.width / 2, host.width - 10)}px`;
      tip.style.top = `${r.top - host.top - 8}px`;
    };
    box.querySelectorAll(".sk-hit").forEach(el => {
      el.addEventListener("pointerenter", () => show(el)); el.addEventListener("focus", () => show(el));
      el.addEventListener("pointerleave", () => { tip.hidden = true; }); el.addEventListener("blur", () => { tip.hidden = true; });
    });
  }

  // ---- every run, as a table ------------------------------------------------------
  function table() {
    const rows = [...S.RUNS].sort((a, b) => a.time - b.time);
    $("sk-runs").innerHTML = rows.map((r, i) => `<tr><td class="st-num">${i + 1}</td>` +
      `<td><span class="sk-dot sk-${r.driver}" aria-hidden="true"></span>${esc(r.name)}</td>` +
      `<td class="st-num">${M.time(r.time)}</td><td>${esc(M.date(r.started))}</td>` +
      `<td>${r.flags.includes("contact") ? "contact" : ""}${r.flags.includes("cutoff") ? `${r.flags.includes("contact") ? ", " : ""}time estimated at the line` : ""}</td>` +
      `<td><a href="replay.html?laps=${r.id},${rows[0].id === r.id ? rows[1].id : rows[0].id}">Replay</a></td></tr>`).join("");
  }

  strip(); table();
  load().catch(err => say(`Couldn’t load the runs: ${err.message}`));
})();
