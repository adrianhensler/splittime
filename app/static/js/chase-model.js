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
      pts.push({s: car.mono[i], p: [c.pos_x[i], c.pos_y[i] - RIDE, c.pos_z[i]]});
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

  /* A wireframe car at `pos` facing `dir` (a unit vector, may climb), as a
     list of [from, to] world points: body, cabin and four wheels. */
  function carEdges(pos, dir) {
    const f = norm(dir) || [1, 0, 0], r = norm(cross(UP, f)) || [0, 0, -1], u = cross(f, r);
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

  const model = {RIDE, RIGS, sub, add, mul, norm, camera, project, segment, road, localLow, heading,
    slope, ease, rig, carEdges};
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  else root.ChaseModel = model;
})(globalThis);
