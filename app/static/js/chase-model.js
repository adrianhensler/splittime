/* Chase view maths: a perspective camera behind one car, the road it drove,
   and wireframe cars. Kept apart from the page so it can be tested without a
   browser. World axes are the game's: x and z on the level, y up, the same
   handedness the Replay map draws (x right, z up the screen from above). */
"use strict";
(function (root) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(a[0], a[1], a[2]); return l > 1e-9 ? mul(a, 1 / l) : null; };
  const UP = [0, 1, 0], NEAR = 0.3;
  // the recorded position is the car's middle, not the road under it
  const RIDE = 0.7;
  const WHEEL_R = 0.34, WHEEL_SIDES = 16;   // wheel radius (m), drawn as a 16-sided disc

  /* A camera at `eye` looking at `target`. right = up x forward keeps a car
     heading along +x with -z on its right, as on the map. */
  function camera(eye, target, fov, width, height) {
    const f = norm(sub(target, eye)) || [1, 0, 0];
    const r = norm(cross(UP, f)) || [0, 0, -1];
    return {eye, f, r, u: cross(f, r), focal: height / 2 / Math.tan(fov / 2), w: width, h: height};
  }
  const toView = (cam, p) => { const d = sub(p, cam.eye); return [dot(d, cam.r), dot(d, cam.u), dot(d, cam.f)]; };
  const toScreen = (cam, v) => [cam.w / 2 + v[0] * cam.focal / v[2], cam.h / 2 - v[1] * cam.focal / v[2]];
  /* screen point and depth, or null behind the camera */
  function project(cam, p) {
    const v = toView(cam, p);
    return v[2] > NEAR ? [...toScreen(cam, v), v[2]] : null;
  }
  /* A world segment on screen as [x1, y1, x2, y2, depth], cut where it passes
     behind the camera; null when all of it is behind. */
  function segment(cam, a, b) {
    let va = toView(cam, a), vb = toView(cam, b);
    if (va[2] <= NEAR && vb[2] <= NEAR) return null;
    if (va[2] <= NEAR || vb[2] <= NEAR) {
      const k = (NEAR - va[2]) / (vb[2] - va[2]);
      const cut = [va[0] + (vb[0] - va[0]) * k, va[1] + (vb[1] - va[1]) * k, NEAR];
      if (va[2] <= NEAR) va = cut; else vb = cut;
    }
    return [...toScreen(cam, va), ...toScreen(cam, vb), (va[2] + vb[2]) / 2];
  }

  /* The road one lap drove, a point every `step` along the route, with edges
     `half` either side on the level. s is the distance along the route. */
  function road(car, step = 5, half = 5) {
    const c = car.channels, pts = [];
    let next = -Infinity;
    for (let i = 0; i < car.t.length; i++) {
      if (car.mono[i] < next) continue;   // backing up re-drives road already laid
      next = car.mono[i] + step;
      // in the air the trace is the flight, not road: drawn apart, never as road
      pts.push({s: car.mono[i], p: [c.pos_x[i], c.pos_y[i] - RIDE, c.pos_z[i]], air: airborne(car, car.dist[i])});
    }
    for (let k = 0; k < pts.length; k++) {
      const a = pts[Math.max(0, k - 1)].p, b = pts[Math.min(pts.length - 1, k + 1)].p;
      const right = norm([b[2] - a[2], 0, a[0] - b[0]]) || [0, 0, 0];
      pts[k].left = sub(pts[k].p, mul(right, half));
      pts[k].right = add(pts[k].p, mul(right, half));
    }
    return pts;
  }
  /* The lowest road within `reach` either side of route position s: the
     level the ground grid and the height posts stand on. */
  function localLow(pts, s, reach = 300) {
    let low = Infinity;
    for (const q of pts) if (Math.abs(q.s - s) <= reach && q.p[1] < low) low = q.p[1];
    return Number.isFinite(low) ? low : (pts[0]?.p[1] ?? 0);
  }
  /* Direction of travel at `time` from where the car was just before and just
     after, which rides over sample noise. null while standing still. */
  function heading(model, car, time, span = 0.25) {
    const a = model.at(car, Math.max(0, time - span)), b = model.at(car, time + span);
    const d = [b.x - a.x, b.y - a.y, b.z - a.z];
    return Math.hypot(d[0], d[2]) > 0.2 ? norm(d) : null;
  }
  /* Climb in percent along a direction (rise over run on the level). */
  const slope = dir => 100 * dir[1] / Math.max(1e-6, Math.hypot(dir[0], dir[2]));
  /* Turn an angle toward another the short way round, by fraction k. */
  function ease(from, to, k) {
    const d = Math.atan2(Math.sin(to - from), Math.cos(to - from));
    return from + d * k;
  }

  /* Camera rigs, in metres: how far behind and above the car, and the point
     ahead of it to look at. */
  const RIGS = {
    chase: {back: 10, up: 3.2, ahead: 8, look: 1, fov: 62},
    close: {back: 5.5, up: 1.7, ahead: 12, look: 0.6, fov: 72},
    high: {back: 40, up: 28, ahead: 12, look: 0, fov: 55},
  };
  /* Eye and target for a rig behind a car at `pos` heading `yaw` (radians
     from +x toward +z), swung round it by `orbit` and pulled out by `zoom`. */
  function rig(pos, yaw, r, orbit = 0, zoom = 1, raise = 0) {
    const a = yaw + orbit, d = [Math.cos(a), 0, Math.sin(a)];
    return {eye: [pos[0] - d[0] * r.back * zoom, pos[1] + (r.up + raise) * zoom, pos[2] - d[2] * r.back * zoom],
      target: [pos[0] + d[0] * r.ahead, pos[1] + r.look, pos[2] + d[2] * r.ahead]};
  }

  /* The car's own axes from the game's angles: forward f, right r, up u.
     Yaw is the game's (forward = (sin yaw, cos yaw) on the level), nose is
     how far the front is raised (the game's pitch with its sign flipped:
     nose up is negative there) and a positive roll drops the right side.
     All checked against real laps' positions and cornering forces. */
  function basis(yaw, nose = 0, roll = 0) {
    const f = [Math.sin(yaw) * Math.cos(nose), Math.sin(nose), Math.cos(yaw) * Math.cos(nose)];
    const r0 = [Math.cos(yaw), 0, -Math.sin(yaw)], u0 = cross(f, r0);
    const c = Math.cos(roll), s = Math.sin(roll);
    return {f, r: sub(mul(r0, c), mul(u0, s)), u: add(mul(u0, c), mul(r0, s))};
  }
  /* Axes for a car with no recorded angles: along its travel, level. */
  function level(dir) {
    const f = norm(dir) || [1, 0, 0], r = norm(cross(UP, f)) || [0, 0, -1];
    return {f, r, u: cross(f, r)};
  }
  const short = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  /* The car's yaw, nose and roll at `time`, or null when the lap was loaded
     without them. Angles move the short way round between samples. Height xN
     raises the nose as it steepens the road; roll is never stretched. */
  function attitude(model, car, time, exag = 1) {
    const c = car.channels;
    if (!c.raw_yaw || !c.raw_pitch || !c.raw_roll || car.t.length < 1) return null;
    const [i, k] = model.locate(car.t, Math.min(time, car.duration)), j = Math.min(i + 1, car.t.length - 1);
    const ang = arr => arr[i] + short(arr[i], arr[j]) * k;
    const nose = -ang(c.raw_pitch);
    return {yaw: ang(c.raw_yaw), nose: exag === 1 ? nose : Math.atan(Math.tan(nose) * exag), roll: ang(c.raw_roll)};
  }
  /* In the air at this distance along the route: inside one of the lap's
     jumps, as the server's own detector found them (every wheel unloaded). */
  const airborne = (car, dist) => (car.jumps || []).some(j => dist >= j.dist0 && dist <= j.dist1);

  /* A wireframe car at `pos`, as a list of [from, to] world points: body,
     cabin and four wheels. `way` is its axes from basis(), or a direction of
     travel (a unit vector, may climb) to sit level along. */
  function carEdges(pos, way) {
    const {f, r, u} = way.f ? way : level(way);
    // x forward, y up, z to the right of the car
    const P = (x, y, z) => add(add(add(pos, mul(f, x)), mul(u, y)), mul(r, z));
    const ring = (back, front, y, w) => [P(front, y, -w), P(front, y, w), P(back, y, w), P(back, y, -w)];
    const hull = (lo, hi) => [0, 1, 2, 3].flatMap(i =>
      [[lo[i], lo[(i + 1) % 4]], [hi[i], hi[(i + 1) % 4]], [lo[i], hi[i]]]);
    const edges = [...hull(ring(-2.3, 2.3, -0.4, 0.95), ring(-2.25, 2.15, 0.15, 0.95)),
      ...hull(ring(-1.45, 0.75, 0.15, 0.85), ring(-1.05, 0.2, 0.68, 0.72))];
    for (const x of [-1.45, 1.4]) for (const z of [-0.95, 0.95]) {
      const w = [P(x - 0.34, -RIDE, z), P(x + 0.34, -RIDE, z), P(x + 0.34, -0.1, z), P(x - 0.34, -0.1, z)];
      edges.push(...w.map((p, i) => [p, w[(i + 1) % 4]]));
    }
    return edges;
  }
  /* The same car as solid quads, each {pts, n, part}: n is the outward unit
     normal, part is body, rear (the body's back, where the brake lights are),
     cabin (no underside: it rests on the body), wheel or hub. */
  function carFaces(pos, way) {
    const {f, r, u} = way.f ? way : level(way);
    const P = (x, y, z) => add(add(add(pos, mul(f, x)), mul(u, y)), mul(r, z));
    const ring = (back, front, y, w) => [P(front, y, -w), P(front, y, w), P(back, y, w), P(back, y, -w)];
    const mid = pts => mul(pts.reduce((a, b) => add(a, b), [0, 0, 0]), 1 / pts.length);
    const out = [];
    const hull = (lo, hi, part) => {
      const centre = mid([...lo, ...hi]);
      const quads = [[lo[3], lo[2], lo[1], lo[0]], hi, ...[0, 1, 2, 3].map(i => [lo[i], lo[(i + 1) % 4], hi[(i + 1) % 4], hi[i]])];
      quads.forEach((pts, k) => {
        if (part === "cabin" && k === 0) return;   // the cabin's underside rests on the body: never seen
        let n = norm(cross(sub(pts[1], pts[0]), sub(pts[3], pts[0]))) || u;
        if (dot(n, sub(mid(pts), centre)) < 0) n = mul(n, -1);   // always pointing out
        out.push({pts, n, part: part === "body" && k === 4 ? "rear" : part});
      });
    };
    hull(ring(-2.3, 2.3, -0.4, 0.95), ring(-2.25, 2.15, 0.15, 0.95), "body");
    hull(ring(-1.45, 0.75, 0.15, 0.85), ring(-1.05, 0.2, 0.68, 0.72), "cabin");
    // round wheels touching the road: a tyre, and a hub a touch further out
    const disc = (x, z, radius) => [...Array(WHEEL_SIDES).keys()].map(k => {
      const a = 2 * Math.PI * k / WHEEL_SIDES;
      return P(x + radius * Math.cos(a), -RIDE + WHEEL_R + radius * Math.sin(a), z);
    });
    for (const x of [-1.45, 1.4]) for (const z of [-1.0, 1.0]) {
      out.push({pts: disc(x, z, WHEEL_R), n: mul(r, Math.sign(z)), part: "wheel"});
      out.push({pts: disc(x, z * 1.02, WHEEL_R * 0.45), n: mul(r, Math.sign(z)), part: "hub"});
    }
    return out;
  }
  /* A face turned toward the camera (the rest are hidden behind the car). */
  function facing(cam, face) {
    const c = mul(face.pts.reduce((a, b) => add(a, b), [0, 0, 0]), 1 / face.pts.length);
    return dot(face.n, sub(c, cam.eye)) < 0;
  }
  /* Screen height of the horizon: a far point level with the eye, straight
     ahead. null when the camera looks straight down. */
  function horizon(cam) {
    const ahead = norm([cam.f[0], 0, cam.f[2]]);
    if (!ahead) return null;
    const p = project(cam, add(cam.eye, mul(ahead, 1e5)));
    return p ? p[1] : null;
  }
  /* Two brake lights across the back of the body, as [from, to] pairs. */
  function brakeLights(pos, way) {
    const {f, r, u} = way.f ? way : level(way);
    const P = (x, y, z) => add(add(add(pos, mul(f, x)), mul(u, y)), mul(r, z));
    return [[P(-2.32, 0.02, -0.9), P(-2.32, 0.02, -0.5)], [P(-2.32, 0.02, 0.5), P(-2.32, 0.02, 0.9)]];
  }

  const model = {RIDE, RIGS, sub, add, mul, norm, camera, project, segment, road, localLow, heading,
    slope, ease, rig, basis, attitude, airborne, carEdges, carFaces, facing, horizon, brakeLights};
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  else root.ChaseModel = model;
})(globalThis);
