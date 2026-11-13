"use strict";
/* Chase view (test): the Replay's laps seen from behind one car, in 3D. */
(function () {
  const M = globalThis.RivalryModel, R = globalThis.ReplayModel, C = globalThis.ChaseModel;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char =>
    ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[char]));
  const CHANNELS = "pos_x,pos_y,pos_z,speed_kmh,gear,throttle,brake,lap_time";
  const FAR = 450;   // metres of road drawn ahead; fades out toward it
  const state = {cars:[], roads:[], dirs:[], time:0, playing:false, speed:1, follow:0, duration:0,
    rig:"chase", orbit:0, raise:0, zoom:1, exag:1, yaw:null, ground:null, last:null, low:0, high:1};
  const canvas = $("ch-canvas"), ctx = canvas.getContext("2d");
  const strip = $("ch-profile"), sctx = strip.getContext("2d");
  const say = text => { $("st-message").textContent = text; };
  // canvas refuses the theme's light-dark(...) colours; an element resolves them
  const probe = document.createElement("span");
  probe.hidden = true; document.body.append(probe);
  const css = name => { probe.style.color = `var(${name})`; return getComputedStyle(probe).color; };

  function label(car) {
    const name = car.meta.driver_name || `Lap ${car.id}`;
    return state.cars.filter(c => c.meta.driver_name === car.meta.driver_name).length > 1 ?
      `${name} ${M.time(car.duration)}` : name;
  }
  const gear = g => g === null || g === undefined ? "—" : g === 0 ? "R" : g === 11 ? "N" : String(g);

  // Lines are batched by how far away they are, so distant road fades into the
  // background without a stroke per segment.
  const BANDS = [[90, 1], [180, 0.7], [300, 0.45], [FAR, 0.2]];
  function lines(segs, color, width, alpha = 1) {
    if (!segs.length) return;
    ctx.strokeStyle = color; ctx.lineWidth = width;
    for (let b = 0; b < BANDS.length; b++) {
      const near = b ? BANDS[b - 1][0] : 0, [far, a] = BANDS[b];
      ctx.beginPath();
      let any = false;
      for (const s of segs) if (s[4] >= near && s[4] < far) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); any = true; }
      if (any) { ctx.globalAlpha = a * alpha; ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
  }

  function draw(dt = 0) {
    if (!state.cars.length) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const target = state.cars[state.follow], s = R.at(target, state.time);
    // ease the camera round on the move; a jump in time (scrub, restart) cuts straight there
    const k = dt > 0 ? 1 - Math.exp(-dt * 4) : 1;
    state.cars.forEach((car, i) => { const d = C.heading(R, car, state.time); if (d) state.dirs[i] = d; });
    const dir = state.dirs[state.follow] || [1, 0, 0], want = Math.atan2(dir[2], dir[0]);
    state.yaw = state.yaw === null || k === 1 ? want : C.ease(state.yaw, want, k);
    const road = state.roads[state.follow], low = C.localLow(road, s.dist);
    state.ground = state.ground === null || k === 1 ? low : state.ground + (low - state.ground) * Math.min(1, k * 0.6);
    const g = state.ground, ex = state.exag, lift = p => [p[0], g + (p[1] - g) * ex, p[2]];
    const pos = lift([s.x, s.y, s.z]), r = C.RIGS[state.rig];
    const view = C.rig(pos, state.yaw, r, state.orbit, state.zoom, state.raise);
    const cam = C.camera(view.eye, view.target, r.fov * Math.PI / 180, w, h);
    const near = p => Math.hypot(p[0] - pos[0], p[2] - pos[2]) < FAR;

    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = "round";
    // the ground: a grid on the lowest road nearby, fixed to the world so it streams past
    const grid = [], G = 25, ox = Math.round(pos[0] / G) * G, oz = Math.round(pos[2] / G) * G;
    for (let i = -12; i <= 12; i++) for (let j = -12; j < 12; j++) {
      for (const [a, b] of [[[ox + i * G, g, oz + j * G], [ox + i * G, g, oz + (j + 1) * G]],
        [[ox + j * G, g, oz + i * G], [ox + (j + 1) * G, g, oz + i * G]]]) {
        const seg = C.segment(cam, a, b);
        if (seg) grid.push(seg);
      }
    }
    lines(grid, css("--st-line"), 1, 0.8);

    // the followed car's road: two edges, ties across, and posts down to the ground
    const edges = [], ties = [], posts = [], centre = [], quads = [];
    for (let i = 1; i < road.length; i++) {
      const a = road[i - 1], b = road[i];
      if (!near(a.p) || !near(b.p) || b.s - a.s > 30) continue;
      const corners = [a.left, b.left, b.right, a.right].map(p => C.project(cam, lift(p)));
      if (corners.every(Boolean) && corners[0][2] < 250) quads.push(corners.flatMap(c => [c[0], c[1]]));
      for (const [p, q, out] of [[a.left, b.left, edges], [a.right, b.right, edges], [a.p, b.p, centre]]) {
        const seg = C.segment(cam, lift(p), lift(q));
        if (seg) out.push(seg);
      }
      if (i % 2 === 0) {
        const seg = C.segment(cam, lift(b.left), lift(b.right));
        if (seg) ties.push(seg);
        for (const side of [b.left, b.right]) {
          const top = lift(side);
          if (top[1] - g > 0.4) { const post = C.segment(cam, top, [side[0], g, side[2]]); if (post) posts.push(post); }
        }
      }
    }
    // a faint surface under the wireframe, so the road reads as solid
    ctx.beginPath();
    for (const q of quads) { ctx.moveTo(q[0], q[1]); ctx.lineTo(q[2], q[3]); ctx.lineTo(q[4], q[5]); ctx.lineTo(q[6], q[7]); ctx.closePath(); }
    ctx.fillStyle = css("--st-muted"); ctx.globalAlpha = 0.12; ctx.fill(); ctx.globalAlpha = 1;
    lines(posts, css("--st-accent"), 1, 0.35);
    lines(ties, css("--st-muted"), 1, 0.5);
    lines(edges, css("--st-fg"), 1.6, 0.75);
    // everyone else's line on the same road, in their colour
    state.cars.forEach((car, n) => {
      if (n === state.follow) return;
      const segs = [], pts = state.roads[n];
      for (let i = 1; i < pts.length; i++) {
        if (!near(pts[i].p) || pts[i].s - pts[i - 1].s > 30) continue;
        const seg = C.segment(cam, lift(pts[i - 1].p), lift(pts[i].p));
        if (seg) segs.push(seg);
      }
      lines(segs, car.color, 1.5, 0.55);
    });
    lines(centre, target.color, 1.5, 0.55);

    // the cars, furthest first, each with a stick down to the ground under it
    const rows = R.standings(state.cars, state.time), placed = new Map(rows.map(row => [row.car, row]));
    const shown = state.cars.map((car, n) => {
      const st = R.at(car, state.time), p = lift([st.x, st.y, st.z]);
      const d = state.dirs[n] || [1, 0, 0], tip = C.norm([d[0], d[1] * ex, d[2]]) || d;
      return {car, p, tip, depth: C.project(cam, p)?.[2] ?? -1};
    }).filter(c => c.depth > 0 && near(c.p)).sort((a, b) => b.depth - a.depth);
    for (const {car, p, tip} of shown) {
      const segs = C.carEdges(p, tip).map(([a, b]) => C.segment(cam, a, b)).filter(Boolean);
      const foot = [p[0], g, p[2]], stick = C.segment(cam, [p[0], p[1] - C.RIDE, p[2]], foot);
      if (stick && p[1] - C.RIDE - g > 0.4) lines([stick], car.color, 1, 0.6);
      const shadow = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [p[0] + u * 1.2, g, p[2] + v * 1.2]);
      lines(shadow.map((q, i) => C.segment(cam, q, shadow[(i + 1) % 4])).filter(Boolean), car.color, 1, 0.5);
      lines(segs, car.color, 2);
      const tag = C.project(cam, [p[0], p[1] + 1.8, p[2]]);
      if (tag && tag[2] < 250) {
        const row = placed.get(car);
        ctx.fillStyle = car.color; ctx.font = "600 12px system-ui, sans-serif"; ctx.textAlign = "center";
        ctx.fillText(`${row.place} ${label(car)}${row.place > 1 ? ` +${row.gap.toFixed(2)}` : ""}`, tag[0], tag[1]);
        ctx.textAlign = "start";
      }
    }

    $("ch-clock").textContent = `${M.time(Math.max(state.time, 0.0005))} / ${M.time(state.duration)}`;
    if (document.activeElement !== $("ch-scrub")) $("ch-scrub").value = String(Math.round(1000 * state.time / state.duration));
    side(rows);
    profile(g);
  }

  // Height along the whole route: the followed car's road, every car's place on
  // it, and the level the posts stand on.
  function profile(ground) {
    const w = strip.clientWidth, h = strip.clientHeight, pad = 6, road = state.roads[state.follow];
    sctx.clearRect(0, 0, w, h);
    if (road.length < 2) return;
    const s0 = road[0].s, s1 = road[road.length - 1].s, lo = state.low, hi = Math.max(state.high, lo + 1);
    const X = s => pad + (w - 2 * pad) * (s - s0) / Math.max(1, s1 - s0);
    const Y = y => h - pad - (h - 2 * pad - 12) * (y - lo) / (hi - lo);
    sctx.beginPath(); sctx.moveTo(X(s0), h);
    for (const q of road) sctx.lineTo(X(q.s), Y(q.p[1]));
    sctx.lineTo(X(s1), h); sctx.closePath();
    sctx.fillStyle = css("--st-line"); sctx.fill();
    sctx.beginPath();
    for (const [i, q] of road.entries()) if (i) sctx.lineTo(X(q.s), Y(q.p[1])); else sctx.moveTo(X(q.s), Y(q.p[1]));
    sctx.strokeStyle = css("--st-muted"); sctx.lineWidth = 1.5; sctx.stroke();
    sctx.setLineDash([3, 3]); sctx.beginPath(); sctx.moveTo(pad, Y(ground)); sctx.lineTo(w - pad, Y(ground));
    sctx.strokeStyle = css("--st-accent"); sctx.lineWidth = 1; sctx.stroke(); sctx.setLineDash([]);
    sctx.fillStyle = css("--st-muted"); sctx.font = "11px system-ui, sans-serif";
    sctx.fillText(`Height along the route · ${Math.round(hi - lo)} m from lowest to highest`, pad + 2, 13);
    for (const [n, car] of [...state.cars.entries()].reverse()) {
      const st = R.at(car, state.time), x = X(Math.min(st.dist, s1)), y = Y(st.y - C.RIDE);
      sctx.beginPath(); sctx.arc(x, y, n === state.follow ? 5 : 4, 0, Math.PI * 2);
      sctx.fillStyle = car.color; sctx.fill();
      sctx.lineWidth = 1.5; sctx.strokeStyle = css("--st-bg"); sctx.stroke();
    }
  }

  function side(rows) {
    $("ch-side").innerHTML = rows.map(({car, state:s, place, gap}) => {
      const n = state.cars.indexOf(car), d = state.dirs[n] || [1, 0, 0];
      return `<div class="rp-car">
      <div class="rp-car-head"><strong><span class="rp-dot" style="background:${car.color}"></span>${place}. ${esc(car.meta.driver_name || `Lap ${car.id}`)}</strong>
        <span class="st-time">${place === 1 ? (s.finished ? M.time(car.duration) : "Ahead") : `+${gap.toFixed(3)} s`}</span></div>
      <div class="st-quiet">${esc(car.meta.car_name || "")}${car.meta.car_pi ? ` · PI ${esc(car.meta.car_pi)}` : ""}</div>
      <div class="rp-nums rp-nums-4"><span><b>${Math.round(s.speed)}</b><span class="st-quiet">km/h</span></span>
        <span><b>${gear(s.gear)}</b><span class="st-quiet">gear</span></span>
        <span><b>${Math.round(s.y - C.RIDE - state.low)}</b><span class="st-quiet">m up</span></span>
        <span><b>${s.finished ? "—" : `${Math.round(C.slope(d))}%`}</b><span class="st-quiet">slope</span></span></div>
      <div class="rp-bar" title="Throttle"><i style="width:${Math.max(0, Math.min(100, s.throttle ?? 0))}%;background:${car.color}"></i></div>
      <div class="rp-bar" title="Brake"><i style="width:${Math.max(0, Math.min(100, s.brake ?? 0))}%;background:var(--st-warn)"></i></div></div>`;
    }).join("");
  }

  // ---- playback -----------------------------------------------------------------
  function frame(now) {
    if (!state.playing) return;
    const dt = state.last === null ? 0 : Math.min(0.1, (now - state.last) / 1000);
    state.time += state.speed * dt; state.last = now;
    if (state.time >= state.duration) { state.time = state.duration; play(false); }
    draw(dt || 1e-3);
    if (state.playing) requestAnimationFrame(frame);
  }
  function play(on) {
    if (on && state.time >= state.duration) state.time = 0;
    state.playing = on; state.last = null;
    $("ch-play").textContent = on ? "Pause" : "Play"; $("ch-play").setAttribute("aria-label", on ? "Pause" : "Play");
    if (on) requestAnimationFrame(frame); else draw(1e-3);
  }
  function resize() {
    const ratio = globalThis.devicePixelRatio || 1;
    for (const [el, c] of [[canvas, ctx], [strip, sctx]]) {
      el.width = Math.round(el.clientWidth * ratio); el.height = Math.round(el.clientHeight * ratio);
      c.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    draw();
  }
  function setRig(name) {
    state.rig = name; state.orbit = 0; state.raise = 0; state.zoom = 1;
    for (const b of document.querySelectorAll("[data-rig]")) b.setAttribute("aria-pressed", String(b.dataset.rig === name));
    draw();
  }

  async function start(ids) {
    say("Loading laps…");
    const res = await fetch("api/rivalry", {cache:"no-store"});
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const meta = new Map();
    for (const g of (await res.json()).categories || []) for (const lap of g.attempts)
      meta.set(lap.lap_id, {...lap, route_id:g.route_id, route_name:g.route_name, car_class_label:g.car_class_label});
    const loaded = await Promise.all(ids.map(async id => {
      const r = await fetch(`api/laps/${id}/data?channels=${CHANNELS}&max_points=6000`);
      if (!r.ok) throw new Error(`lap ${id}: HTTP ${r.status}`);
      return r.json();
    }));
    const usable = loaded.filter(d => d.t.length > 1 && d.channels.pos_y);
    if (!usable.length) throw new Error("none of these laps has a recorded trace");
    state.cars = usable.map((data, i) => R.car(data, meta.get(data.lap.id), i));
    state.roads = state.cars.map(car => C.road(car));
    state.duration = Math.max(...state.cars.map(c => c.duration));
    const box = R.bounds(state.cars);
    state.low = box.minY - C.RIDE; state.high = box.maxY - C.RIDE;
    const routes = new Set(state.cars.map(c => c.meta.route_name).filter(Boolean));
    $("ch-label").textContent = `${[...routes].join(" / ") || "Recorded laps"} · ${state.cars.length} laps`;
    $("ch-follow").innerHTML = state.cars.map((c, i) =>
      `<option value="${i}">Follow ${esc(label(c))}</option>`).join("");
    $("ch-back").href = `replay.html?laps=${state.cars.map(c => c.id).join(",")}`;
    $("ch-stage").hidden = false;
    say(`${[...routes][0] || "Route"} · press Play. Heights are in metres above the route’s lowest point.`);
    resize();
  }

  // ---- wiring -------------------------------------------------------------------
  $("ch-play").addEventListener("click", () => play(!state.playing));
  $("ch-restart").addEventListener("click", () => { state.time = 0; state.yaw = null; play(true); });
  $("ch-speed").addEventListener("change", e => { state.speed = Number(e.target.value) || 1; });
  $("ch-exag").addEventListener("change", e => { state.exag = Number(e.target.value) || 1; draw(); });
  $("ch-scrub").addEventListener("input", e => { state.time = state.duration * Number(e.target.value) / 1000; state.last = null; draw(); });
  $("ch-follow").addEventListener("change", e => { state.follow = Number(e.target.value); state.yaw = null; state.ground = null; draw(); });
  for (const b of document.querySelectorAll("[data-rig]")) b.addEventListener("click", () => setRig(b.dataset.rig));
  let drag = null;
  canvas.addEventListener("pointerdown", e => { drag = {x:e.clientX, y:e.clientY}; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = "grabbing"; });
  canvas.addEventListener("pointermove", e => {
    if (!drag) return;
    state.orbit -= (e.clientX - drag.x) * 0.008;
    state.raise = Math.max(-C.RIGS[state.rig].up + 0.5, Math.min(60, state.raise + (e.clientY - drag.y) * 0.05));
    drag = {x:e.clientX, y:e.clientY}; draw();
  });
  const drop = () => { drag = null; canvas.style.cursor = "grab"; };
  canvas.addEventListener("pointerup", drop); canvas.addEventListener("pointercancel", drop);
  canvas.addEventListener("dblclick", () => setRig(state.rig));
  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    state.zoom = Math.max(0.4, Math.min(5, state.zoom * Math.exp(e.deltaY * 0.0015))); draw();
  }, {passive:false});
  document.addEventListener("keydown", e => {
    if ($("ch-stage").hidden || ["INPUT","SELECT","BUTTON","A"].includes(e.target.tagName)) return;
    if (e.key === " ") { e.preventDefault(); play(!state.playing); }
  });
  globalThis.addEventListener("resize", resize);

  const ids = R.parseLaps(location.search);
  if (!ids.length) {
    $("st-message").innerHTML = 'Choose laps in <a href="replay.html">Replay</a> first, then open the Chase view from there.';
  } else start(ids).catch(error => say(`Could not load the chase view (${error.message}).`));
})();
