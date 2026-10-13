"use strict";
(function () {
  const M = globalThis.RivalryModel, R = globalThis.ReplayModel, $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char =>
    ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[char]));
  const CHANNELS = "pos_x,pos_y,pos_z,speed_kmh,gear,throttle,brake,lap_time";
  const EST = "The game stopped sending data at the finish line, so this time is SplitTime’s last clock reading.";
  const est = car => car.estimated ? ` <abbr class="st-est" title="${EST}">est.</abbr>` : "";
  const CAVEAT = "Recorded laps, driven at different times. Places and gaps are exploratory: a shared route does not prove the same direction, checkpoints or timing.";
  const state = {cars:[], time:0, playing:false, speed:1, mode:"top", follow:0, duration:0,
    view:null, box:null, last:null, categories:[]};
  const canvas = $("rp-canvas"), ctx = canvas.getContext("2d");
  const say = text => { $("st-message").textContent = text; };
  const css = name => getComputedStyle(document.body).getPropertyValue(name).trim();

  // ---- choosing laps -------------------------------------------------------
  function picker() {
    const groups = state.categories.filter(g => g.attempts.filter(M.usable).length >= 2);
    $("rp-picker").hidden = false; $("rp-stage").hidden = true;
    if (!groups.length) { say("A replay needs two timed laps on the same route. None recorded yet."); return; }
    say("Choose two or more laps on one route, then start the replay.");
    $("rp-route").innerHTML = groups.map((g,i) =>
      `<option value="${i}">${esc(g.route_name)} · ${esc(g.car_class_label)} · ${g.attempts.filter(M.usable).length} laps</option>`).join("");
    const list = () => {
      const g = groups[Number($("rp-route").value)], best = new Set([...M.bests(g).values()].map(l => l.lap_id));
      const rows = g.attempts.filter(M.usable).sort((a,b) => a.time_s-b.time_s);
      // start from each driver's best; one driver alone races their two fastest
      const ticked = best.size >= 2 ? best : new Set(rows.slice(0,2).map(l => l.lap_id));
      $("rp-laps").innerHTML = rows.map(lap =>
        `<tr><td><input type="checkbox" value="${lap.lap_id}" ${ticked.has(lap.lap_id) ? "checked" : ""}
          aria-label="${esc(lap.driver_name)} ${M.time(lap.time_s)}"></td>
          <td><span class="st-time">${M.time(lap.time_s)}</span>${best.has(lap.lap_id) ? ' <span class="st-quiet">best</span>' : ""}</td>
          <td>${esc(lap.driver_name)}<div class="st-quiet">${esc(lap.car_name || "Unknown car")} · PI ${esc(lap.car_pi ?? "?")}</div></td>
          <td class="st-quiet">${esc(M.date(lap.finished_at_utc || lap.started_at_utc))}</td></tr>`).join("");
      count();
    };
    const chosen = () => [...$("rp-laps").querySelectorAll("input:checked")].map(i => Number(i.value));
    const count = () => {
      const n = chosen().length;
      $("rp-go").disabled = n < 2 || n > R.COLORS.length;
      $("rp-go").textContent = n < 2 ? "Choose two or more laps" :
        n > R.COLORS.length ? `At most ${R.COLORS.length} laps` : `Replay ${n} laps`;
    };
    $("rp-route").onchange = list; $("rp-laps").onchange = count;
    $("rp-go").onclick = () => { location.search = `?laps=${chosen().join(",")}`; };
    list();
  }

  // ---- camera ---------------------------------------------------------------
  function fit() {
    const b = state.box, w = canvas.clientWidth, h = canvas.clientHeight;
    state.view = {cx:b.cx, cz:b.cz, cy:b.minY, yaw:0, pitch:0, anchor:0.5, panX:0, panY:0,
      relief: 1, scale: 0.86 * Math.min(w / Math.max(b.maxX-b.minX,1), h / Math.max(b.maxZ-b.minZ,1))};
    if (state.mode === "tilt") { state.view.pitch = 0.95; state.view.yaw = 0.5; state.view.relief = 3; }
  }
  function setMode(mode) {
    state.mode = mode;
    for (const b of document.querySelectorAll("[data-view]")) b.setAttribute("aria-pressed", String(b.dataset.view === mode));
    $("rp-follow").hidden = mode !== "follow";
    $("rp-hint").textContent = mode === "follow" ? "Following · scroll to zoom" :
      mode === "tilt" ? "Drag to turn · shift-drag to move · scroll to zoom" : "Drag to move · scroll to zoom";
    fit(); draw();
  }
  function resize() {
    const ratio = globalThis.devicePixelRatio || 1;
    canvas.width = Math.round(canvas.clientWidth * ratio); canvas.height = Math.round(canvas.clientHeight * ratio);
    ctx.setTransform(ratio,0,0,ratio,0,0);
    if (state.box) { fit(); draw(); }
  }

  // ---- drawing ---------------------------------------------------------------
  function draw() {
    if (!state.cars.length || !state.view) return;
    const w = canvas.clientWidth, h = canvas.clientHeight, view = state.view;
    const rows = R.standings(state.cars, state.time);
    if (state.mode === "follow") {
      const target = state.cars[state.follow] || state.cars[0], s = R.at(target, state.time);
      // ease the camera so a noisy heading does not shake the picture
      const want = Math.PI / 2 - s.heading;
      let turn = want - view.yaw;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      view.yaw += turn * (state.playing ? 0.12 : 1);
      Object.assign(view, {cx:s.x, cz:s.z, cy:s.y, pitch:1.05, anchor:0.72, panX:0, panY:0, relief:1});
      view.scale = (view.zoom || 1) * Math.min(w,h) / 150;  // about 150 m of road in view
    }
    const proj = R.projector(view, w, h);
    ctx.clearRect(0,0,w,h);
    ctx.lineJoin = ctx.lineCap = "round";
    // the road: every lap's line, faint, so the route reads even off the pace line
    state.cars.forEach((car, n) => {
      const c = car.channels;
      ctx.beginPath();
      for (let i = 0; i < car.t.length; i++) {
        const [x,y] = proj(c.pos_x[i], c.pos_y[i], c.pos_z[i]);
        if (i) ctx.lineTo(x,y); else ctx.moveTo(x,y);
      }
      ctx.strokeStyle = css("--st-muted"); ctx.globalAlpha = n ? 0.25 : 0.5;
      ctx.lineWidth = state.mode === "follow" ? 5 : 2.5; ctx.stroke();
    });
    ctx.globalAlpha = 1;
    // a short tail behind each car, then the car, slowest first so the leader is on top
    for (const row of [...rows].reverse()) {
      const car = row.car, c = car.channels, [i] = R.locate(car.t, Math.min(state.time, car.traceEnd));
      const [from] = R.locate(car.t, Math.max(0, state.time - 4));
      ctx.beginPath();
      for (let k = from; k <= i; k++) {
        const [x,y] = proj(c.pos_x[k], c.pos_y[k], c.pos_z[k]);
        if (k === from) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      const [px,py] = proj(row.state.x, row.state.y, row.state.z);
      ctx.lineTo(px,py); ctx.strokeStyle = car.color; ctx.lineWidth = 3; ctx.globalAlpha = 0.6; ctx.stroke();
      ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(px,py, state.mode === "follow" ? 9 : 6.5, 0, Math.PI*2);
      ctx.fillStyle = car.color; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = css("--st-bg"); ctx.stroke();
      // stacked by place, so cars running together keep readable labels
      ctx.fillStyle = car.color; ctx.font = "600 11px system-ui, sans-serif";
      ctx.fillText(`${row.place} ${label(car)}`, px + 12, py - 8 - 13 * (rows.length - row.place));
    }
    $("rp-clock").textContent = `${M.time(Math.max(state.time, 0.0005))} / ${M.time(state.duration)}`;
    if (document.activeElement !== $("rp-scrub")) $("rp-scrub").value = String(Math.round(1000 * state.time / state.duration));
    side(rows);
  }
  // two laps by one driver are told apart by their times
  function label(car) {
    const name = car.meta.driver_name || `Lap ${car.id}`;
    return state.cars.filter(c => c.meta.driver_name === car.meta.driver_name).length > 1 ?
      `${name} ${M.time(car.duration)}` : name;
  }
  // Data Out gears: 0 is reverse, 11 is neutral
  const gear = g => g === null || g === undefined ? "—" : g === 0 ? "R" : g === 11 ? "N" : String(g);
  function side(rows) {
    $("rp-side").innerHTML = rows.map(({car,state:s,place,gap}) => `<div class="rp-car">
      <div class="rp-car-head"><strong><span class="rp-dot" style="background:${car.color}"></span>${place}. ${esc(car.meta.driver_name || `Lap ${car.id}`)}</strong>
        <span class="st-time">${place === 1 ? (s.finished ? M.time(car.duration) : "Ahead") : `+${gap.toFixed(3)} s`}</span></div>
      <div class="st-quiet">${esc(car.meta.car_name || "")}${car.meta.car_pi ? ` · PI ${esc(car.meta.car_pi)}` : ""} · ${M.time(car.duration)}${est(car)}${s.finished ? (car.estimated ? " · finished (estimated)" : " · finished") : ""}</div>
      <div class="rp-nums"><span><b>${Math.round(s.speed)}</b><span class="st-quiet">km/h</span></span>
        <span><b>${gear(s.gear)}</b><span class="st-quiet">gear</span></span>
        <span><b>${Math.round(100 * Math.min(1, s.dist / (car.mono[car.mono.length-1] || 1)))}%</b><span class="st-quiet">of route</span></span></div>
      <div class="rp-bar" title="Throttle"><i style="width:${Math.max(0,Math.min(100,s.throttle ?? 0))}%;background:${car.color}"></i></div>
      <div class="rp-bar" title="Brake"><i style="width:${Math.max(0,Math.min(100,s.brake ?? 0))}%;background:var(--st-warn)"></i></div></div>`).join("");
  }

  // ---- playback ---------------------------------------------------------------
  function frame(now) {
    if (!state.playing) return;
    if (state.last !== null) state.time += state.speed * Math.min(0.1, (now - state.last) / 1000);
    state.last = now;
    if (state.time >= state.duration) { state.time = state.duration; play(false); }
    draw();
    if (state.playing) requestAnimationFrame(frame);
  }
  function play(on) {
    if (on && state.time >= state.duration) state.time = 0;
    state.playing = on; state.last = null;
    $("rp-play").textContent = on ? "Pause" : "Play"; $("rp-play").setAttribute("aria-label", on ? "Pause" : "Play");
    if (on) requestAnimationFrame(frame); else draw();
  }

  async function start(ids) {
    say("Loading laps…");
    const meta = new Map();
    for (const g of state.categories) for (const lap of g.attempts)
      meta.set(lap.lap_id, {...lap, route_name:g.route_name, car_class_label:g.car_class_label});
    const loaded = await Promise.all(ids.map(async id => {
      const res = await fetch(`api/laps/${id}/data?channels=${CHANNELS}&max_points=6000`);
      if (!res.ok) throw new Error(`lap ${id}: HTTP ${res.status}`);
      return res.json();
    }));
    const usable = loaded.filter(d => d.t.length > 1);
    if (usable.length < 2) throw new Error("fewer than two of these laps have a recorded trace");
    state.cars = usable.map((data, i) => R.car(data, meta.get(data.lap.id), i));
    state.duration = Math.max(...state.cars.map(c => c.duration));
    state.box = R.bounds(state.cars);
    const first = state.cars[0].meta, routes = new Set(state.cars.map(c => c.meta.route_name));
    $("rp-label").textContent = `${[...routes].filter(Boolean).join(" / ") || "Recorded laps"} · ${state.cars.length} laps`;
    $("rp-follow").innerHTML = state.cars.map((c,i) => `<option value="${i}">${esc(c.meta.driver_name || `Lap ${c.id}`)} · ${M.time(c.duration)}${c.estimated ? " est." : ""}</option>`).join("");
    $("rp-picker").hidden = true; $("rp-stage").hidden = false; $("rp-share").hidden = false;
    say(routes.size > 1 ? `These laps are on different routes, so the places and gaps mean little. ${CAVEAT}` :
      `${first.route_name || "Route"} · press Play. ${CAVEAT}`);
    resize(); setMode("top");
  }

  // ---- wiring -------------------------------------------------------------------
  $("rp-play").addEventListener("click", () => play(!state.playing));
  $("rp-restart").addEventListener("click", () => { state.time = 0; play(true); });
  $("rp-speed").addEventListener("change", e => { state.speed = Number(e.target.value) || 1; });
  $("rp-scrub").addEventListener("input", e => { state.time = state.duration * Number(e.target.value) / 1000; state.last = null; draw(); });
  $("rp-follow").addEventListener("change", e => { state.follow = Number(e.target.value); draw(); });
  $("rp-share").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(location.href); $("rp-share").textContent = "Link copied"; }
    catch { $("rp-share").textContent = "Copy the address bar"; }
    setTimeout(() => { $("rp-share").textContent = "Copy link"; }, 2000);
  });
  for (const b of document.querySelectorAll("[data-view]")) b.addEventListener("click", () => setMode(b.dataset.view));
  let drag = null;
  canvas.addEventListener("pointerdown", e => { if (state.mode === "follow" || !state.view) return;
    drag = {x:e.clientX, y:e.clientY}; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = "grabbing"; });
  canvas.addEventListener("pointermove", e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y, v = state.view;
    drag = {x:e.clientX, y:e.clientY};
    if (state.mode === "tilt" && !e.shiftKey) {
      v.yaw += dx * 0.008; v.pitch = Math.max(0, Math.min(1.35, v.pitch + dy * 0.006));
    } else { v.panX += dx; v.panY += dy; }
    draw();
  });
  const drop = () => { drag = null; canvas.style.cursor = "grab"; };
  canvas.addEventListener("pointerup", drop); canvas.addEventListener("pointercancel", drop);
  canvas.addEventListener("wheel", e => {
    if (!state.view) return;
    e.preventDefault();
    const k = Math.exp(-e.deltaY * 0.0015);
    if (state.mode === "follow") state.view.zoom = Math.max(0.3, Math.min(6, (state.view.zoom || 1) * k));
    else state.view.scale *= k;
    draw();
  }, {passive:false});
  document.addEventListener("keydown", e => {
    if ($("rp-stage").hidden || ["INPUT","SELECT","BUTTON","A"].includes(e.target.tagName)) return;
    if (e.key === " ") { e.preventDefault(); play(!state.playing); }
  });
  globalThis.addEventListener("resize", resize);

  (async () => {
    try {
      const res = await fetch("api/rivalry", {cache:"no-store"});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.categories = (await res.json()).categories || [];
      const ids = R.parseLaps(location.search);
      if (ids.length >= 2) await start(ids); else picker();
    } catch (error) {
      say(`Could not load the replay (${error.message}).`);
      if (state.categories.length) picker();
    }
  })();
})();
