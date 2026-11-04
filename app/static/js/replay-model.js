/* Replay maths, kept apart from the page so it can be tested without a
   browser. A "car" is one recorded lap: parallel arrays t (seconds on the
   game's own lap clock), dist (odometer along the route) and the channels. */
"use strict";
(function (root) {
  const LAUNCH_MOVE = 1;   // odometer units past the start line: not launched until then
  const COLORS = ["#6ce0cb", "#ffb454", "#8fb8ff", "#ff7a9c", "#c9a6ff", "#d7e36b"];
  /* index i with arr[i] <= value < arr[i+1], clamped to the array */
  function locate(arr, value) {
    let lo = 0, hi = arr.length - 1;
    if (hi < 1 || value <= arr[0]) return [0, 0];
    if (value >= arr[hi]) return [hi, 0];
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] <= value) lo = mid; else hi = mid;
    }
    const span = arr[hi] - arr[lo];
    return [lo, span > 0 ? (value - arr[lo]) / span : 0];
  }
  const lerp = (arr, i, f) => f && i + 1 < arr.length ? arr[i] + (arr[i + 1] - arr[i]) * f : arr[i];
  /* everything about a car at replay time `time` */
  function at(car, time) {
    // a trace can run on past the line (results screen frames): the lap is
    // over at its recorded time and the dot stays where it was then
    const [i, f] = locate(car.t, Math.min(time, car.duration)), c = car.channels;
    const j = Math.min(i + 1, car.t.length - 1);
    return {
      x: lerp(c.pos_x, i, f), y: lerp(c.pos_y, i, f), z: lerp(c.pos_z, i, f),
      dist: lerp(car.dist, i, f), speed: lerp(c.speed_kmh, i, f),
      gear: c.gear ? c.gear[f > 0.5 ? j : i] : null,
      throttle: c.throttle ? lerp(c.throttle, i, f) : null,
      brake: c.brake ? lerp(c.brake, i, f) : null,
      heading: Math.atan2(c.pos_z[j] - c.pos_z[Math.max(0, j - 1)], c.pos_x[j] - c.pos_x[Math.max(0, j - 1)]),
      finished: time >= car.duration,
    };
  }
  /* seconds when the car FIRST reached `dist` along the route. `mono` has
     flat stretches wherever the car stood still or backed up and re-drove a
     section; the first crossing is the start of such a stretch, not its end
     (which is what `locate` would answer). */
  function timeAtDist(car, dist) {
    const m = car.mono, last = m.length - 1;
    if (last < 1 || dist <= m[0]) return car.t[0];
    if (dist > m[last]) return car.t[last];
    let lo = 0, hi = last;          // lowest index with m[index] >= dist
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (m[mid] < dist) lo = mid + 1; else hi = mid;
    }
    const span = m[lo] - m[lo - 1];
    return car.t[lo - 1] + (car.t[lo] - car.t[lo - 1]) * (span > 0 ? (dist - m[lo - 1]) / span : 1);
  }
  /* The time axis is the game's lap clock, not when packets arrived: a
     recording with network jitter or a stalled stream would otherwise run on
     wall time and could be shown "finished" before its dot reached the line.
     The API already repairs a dead lap clock (point-to-point events) from the
     race clock. Arrival time is the fallback only when there is no clock. */
  function axis(data) {
    const clock = data.channels.lap_time;
    if (!clock || clock.length !== data.t.length || !(clock[clock.length - 1] > 0)) return data.t;
    let peak = clock[0];
    return clock.map(v => (peak = Math.max(peak, v)) - clock[0]);
  }
  /* Build a car from GET api/laps/{id}/data. `mono` is dist made
     non-decreasing, so a lap that backed up still answers timeAtDist. */
  function car(data, meta, index) {
    let peak = -Infinity;
    const mono = data.dist.map(d => (peak = Math.max(peak, d)));
    // A run's recorded time is start line to finish line, but its trace opens
    // earlier: held on the grid at distance 0 through the countdown, or on a
    // run-up from negative distance (real sprints: 13-170 units before the
    // line, 0.7-2.2 s). Start the replay clock where the car leaves the line,
    // or the dot would still be seconds from the finish when its time is up.
    let launch = 0;
    while (launch + 1 < data.dist.length && data.dist[launch + 1] <= LAUNCH_MOVE) launch++;
    const clock = axis(data), hold = clock[launch] || 0;
    // drop what came before the launch, so time 0 is the car on the line
    const cut = arr => launch ? arr.slice(launch) : arr;
    const t = launch ? cut(clock).map(v => v - hold) : clock, last = t[t.length - 1] || 0;
    const channels = Object.fromEntries(Object.entries(data.channels).map(([k, v]) => [k, cut(v)]));
    return {id: data.lap.id, t, dist: cut(data.dist), mono: cut(mono), channels,
      estimated: meta?.finish === "last_packet",
      // the recorded time is the result; the trace can end a frame or two early
      duration: Number.isFinite(meta?.time_s) && meta.time_s > 0 ? meta.time_s : last,
      traceEnd: last, meta: meta || {}, color: COLORS[index % COLORS.length]};
  }
  /* Who is ahead at `time`, and by how much. The leader is the car furthest
     along the route (a finished car by its lap time). gap = how much later
     this car reaches the leader's spot; a car that never got there is null. */
  function standings(cars, time) {
    const now = cars.map(c => ({car: c, state: at(c, time)}));
    now.sort((a, b) => (b.state.finished - a.state.finished) ||
      (a.state.finished ? a.car.duration - b.car.duration : b.state.dist - a.state.dist));
    const lead = now[0];
    return now.map((row, place) => {
      let gap = 0;
      if (place) {
        if (lead.state.finished && row.state.finished) gap = row.car.duration - lead.car.duration;
        else {
          const spot = Math.min(lead.state.dist, row.car.mono[row.car.mono.length - 1]);
          const reached = row.state.dist >= spot;
          // behind: time since the leader was where this car is now
          gap = reached ? 0 : time - timeAtDist(lead.car, row.state.dist);
        }
      }
      return {...row, place: place + 1, gap};
    });
  }
  function bounds(cars) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of cars) for (let i = 0; i < c.t.length; i++) {
      const x = c.channels.pos_x[i], y = c.channels.pos_y[i], z = c.channels.pos_z[i];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    return {minX, maxX, minZ, maxZ, minY, maxY, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2,
      size: Math.max(maxX - minX, maxZ - minZ, 1)};
  }
  /* World -> screen. x right, z up (the same way the route outlines are
     drawn). yaw turns the ground plane about the focus, pitch tips it away
     from the viewer; height lifts a point up the screen once tipped. */
  function projector(view, width, height) {
    const cos = Math.cos(view.yaw), sin = Math.sin(view.yaw);
    const flat = Math.cos(view.pitch), lift = Math.sin(view.pitch);
    return (x, y, z) => {
      const dx = x - view.cx, dz = z - view.cz;
      const rx = dx * cos - dz * sin, rz = dx * sin + dz * cos;
      return [width / 2 + rx * view.scale + view.panX,
              height * view.anchor - (rz * flat + (y - view.cy) * lift * view.relief) * view.scale + view.panY];
    };
  }
  function parseLaps(search) {
    const raw = new URLSearchParams(search).get("laps") || "";
    return [...new Set(raw.split(",").map(Number).filter(n => Number.isSafeInteger(n) && n > 0))].slice(0, COLORS.length);
  }
  /* The corner this route position is in, or null on a straight. */
  function cornerAt(corners, dist) {
    return (corners || []).find(c => dist >= c.s_entry && dist <= c.s_exit) || null;
  }
  const reach = car => car.mono[car.mono.length - 1];
  /* A lap that got as far as `dist`. A run cut off partway must not answer for
     road it never drove: timeAtDist would pin it all to the lap's last point. */
  const carReaching = (cars, dist) => cars.find(c => c.mono.length > 1 && reach(c) >= dist) || null;
  /* Where each corner's apex sits on the map. A corner no lap reached has no mark. */
  function markers(cars, corners) {
    return (corners || []).flatMap(c => {
      const car = carReaching(cars, c.s_apex);
      if (!car) return [];
      const s = at(car, timeAtDist(car, c.s_apex));
      return [{corner: c, x: s.x, y: s.y, z: s.z}];
    });
  }
  /* The lap to draw a stretch on: one that drove all of it, else whoever got furthest. */
  const carOver = (cars, to) => carReaching(cars, to) ||
    cars.reduce((best, c) => reach(c) > reach(best) ? c : best);
  /* A stretch of road named in the address: ?at=from,to&name=C7. Links carry
     the position, not the number, because corner numbers can move when a route
     gets a new reference lap (ADR 40). Anything malformed means no stretch. */
  function parseAt(search) {
    const params = new URLSearchParams(search), raw = params.get("at") || "";
    if (!/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(raw)) return null;
    const [from, to] = raw.split(",").map(Number);
    if (!(to > from)) return null;
    const name = params.get("name") || "";
    return {from, to, name: /^[CS]\d{1,3}$/.test(name) ? name : null};
  }
  const nameOf = name => !name ? "this stretch" : name[0] === "S" ? `Section ${name.slice(1)}` : name;
  /* The stretch to play: a run-up to the first car arriving, until the last has left. */
  function clip(cars, from, to, runUp = 3, runOut = 1) {
    const present = cars.filter(c => c.mono.length > 1 && from < reach(c));
    if (!present.length) return null;
    const start = Math.max(0, Math.min(...present.map(c => timeAtDist(c, from))) - runUp);
    const end = Math.max(...present.map(c => timeAtDist(c, Math.min(to, reach(c))))) + runOut;
    return {start, end: Math.min(end, Math.max(...cars.map(c => c.duration)))};
  }
  /* True on the run-up to a stretch that has yet to play. */
  const approaching = (stretch, dist) => Boolean(stretch?.armed) && dist < stretch.from;
  /* Sample range [first, last] of a car over a stretch of road. */
  function span(car, from, to) {
    return [locate(car.mono, from)[0], Math.min(locate(car.mono, to)[0] + 1, car.mono.length - 1)];
  }
  /* What to frame for a stretch: its centre, and a size that never closes in on
     a few metres, so the road around it still reads. */
  function focus(car, from, to, least = 250) {
    const [first, last] = span(car, from, to), c = car.channels;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = first; i <= last; i++) {
      minX = Math.min(minX, c.pos_x[i]); maxX = Math.max(maxX, c.pos_x[i]);
      minZ = Math.min(minZ, c.pos_z[i]); maxZ = Math.max(maxZ, c.pos_z[i]);
    }
    return {cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2,
      width: Math.max(maxX - minX, least), height: Math.max(maxZ - minZ, least)};
  }
  /* The line under the map. `seg` is this corner in a two-lap comparison, when
     its times can be stated. Turn direction is unverified, so it never says
     left or right (ADR 40). dt > 0 means the first lap was quicker. */
  function caption(corner, seg, nameA, nameB) {
    if (!corner) return "";
    const parts = [`C${corner.n}`, corner.kind];
    if (seg && !seg.partial && Number.isFinite(seg.dt)) {
      parts.push(seg.dt === 0 ? "level" : `${seg.dt > 0 ? nameA : nameB} +${Math.abs(seg.dt).toFixed(3)} s`);
      const a = seg.a?.min_kmh, b = seg.b?.min_kmh;
      if (Number.isFinite(a) && Number.isFinite(b)) parts.push(`min ${Math.round(a)} / ${Math.round(b)} km/h`);
    }
    return parts.join(" · ");
  }
  const model = {COLORS, locate, at, timeAtDist, axis, car, standings, bounds, projector, parseLaps,
    cornerAt, markers, carOver, parseAt, nameOf, clip, approaching, span, focus, caption};
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  else root.ReplayModel = model;
})(globalThis);
