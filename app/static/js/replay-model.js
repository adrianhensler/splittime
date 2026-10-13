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
  const model = {COLORS, locate, at, timeAtDist, axis, car, standings, bounds, projector, parseLaps};
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  else root.ReplayModel = model;
})(globalThis);
