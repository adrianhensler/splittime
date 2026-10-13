/* Replay maths, kept apart from the page so it can be tested without a
   browser. A "car" is one recorded lap: parallel arrays t (seconds from the
   lap's own start), dist (metres along the route) and the channels. */
"use strict";
(function (root) {
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
    const [i, f] = locate(car.t, time), c = car.channels;
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
  /* seconds when the car reached `dist` along the route (first time) */
  function timeAtDist(car, dist) {
    const [i, f] = locate(car.mono, dist);
    return lerp(car.t, i, f);
  }
  /* Build a car from GET api/laps/{id}/data. `mono` is dist made
     non-decreasing, so a lap that backed up still answers timeAtDist. */
  function car(data, meta, index) {
    let peak = -Infinity;
    const mono = data.dist.map(d => (peak = Math.max(peak, d)));
    const last = data.t[data.t.length - 1] || 0;
    return {id: data.lap.id, t: data.t, dist: data.dist, mono, channels: data.channels,
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
  const model = {COLORS, locate, at, timeAtDist, car, standings, bounds, projector, parseLaps};
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  else root.ReplayModel = model;
})(globalThis);
