"use strict";
/* Replay's Chase camera: the laps seen from behind one car, in 3D, drawn on a
   plain canvas. The maths is in chase-model.js; this file only draws. */
(function (root) {
  const R = root.ReplayModel, C = root.ChaseModel;
  const FAR = 450;   // metres of road drawn ahead; fades out toward it
  // Lines are batched by how far away they are, so distant road fades into the
  // background without a stroke per segment.
  const BANDS = [[90, 1], [180, 0.7], [300, 0.45], [FAR, 0.2]];

  /* `css(name)` resolves a theme colour for the canvas. */
  function create(canvas, ctx, css) {
    const cam = {yaw: null, ground: null};
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

    /* f: {cars, roads, dirs, time, follow, rig, orbit, raise, zoom, exag, dt,
       rows, label}. dt > 0 eases the camera round; 0 (a scrub, a new car)
       cuts straight there. Returns the ground level, for the height strip. */
    function draw(f) {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const target = f.cars[f.follow], s = R.at(target, f.time);
      const k = f.dt > 0 ? 1 - Math.exp(-f.dt * 4) : 1;
      f.cars.forEach((car, i) => { const d = C.heading(R, car, f.time); if (d) f.dirs[i] = d; });
      const dir = f.dirs[f.follow] || [1, 0, 0], want = Math.atan2(dir[2], dir[0]);
      cam.yaw = cam.yaw === null || k === 1 ? want : C.ease(cam.yaw, want, k);
      const road = f.roads[f.follow], low = C.localLow(road, s.dist);
      cam.ground = cam.ground === null || k === 1 ? low : cam.ground + (low - cam.ground) * Math.min(1, k * 0.6);
      const g = cam.ground, ex = f.exag, lift = p => [p[0], g + (p[1] - g) * ex, p[2]];
      // stretch the road under a car, then add its ride height unstretched
      const seat = st => [st.x, g + (st.y - C.RIDE - g) * ex + C.RIDE, st.z];
      const pos = seat(s), r = C.RIGS[f.rig];
      const view = C.rig(pos, cam.yaw, r, f.orbit, f.zoom, f.raise);
      const eye = C.camera(view.eye, view.target, r.fov * Math.PI / 180, w, h);
      const near = p => Math.hypot(p[0] - pos[0], p[2] - pos[2]) < FAR;

      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round";
      // the ground: a grid on the lowest road nearby, fixed to the world so it streams past
      const grid = [], G = 25, ox = Math.round(pos[0] / G) * G, oz = Math.round(pos[2] / G) * G;
      for (let i = -12; i <= 12; i++) for (let j = -12; j < 12; j++) {
        for (const [a, b] of [[[ox + i * G, g, oz + j * G], [ox + i * G, g, oz + (j + 1) * G]],
          [[ox + j * G, g, oz + i * G], [ox + (j + 1) * G, g, oz + i * G]]]) {
          const seg = C.segment(eye, a, b);
          if (seg) grid.push(seg);
        }
      }
      lines(grid, css("--st-line"), 1, 0.8);

      // the followed car's road: two edges, ties across, and posts down to the ground
      const edges = [], ties = [], posts = [], centre = [], quads = [];
      for (let i = 1; i < road.length; i++) {
        const a = road[i - 1], b = road[i];
        if (!near(a.p) || !near(b.p) || b.s - a.s > 30) continue;
        const corners = [a.left, b.left, b.right, a.right].map(p => C.project(eye, lift(p)));
        if (corners.every(Boolean) && corners[0][2] < 250) quads.push(corners.flatMap(c => [c[0], c[1]]));
        for (const [p, q, out] of [[a.left, b.left, edges], [a.right, b.right, edges], [a.p, b.p, centre]]) {
          const seg = C.segment(eye, lift(p), lift(q));
          if (seg) out.push(seg);
        }
        if (i % 2 === 0) {
          const seg = C.segment(eye, lift(b.left), lift(b.right));
          if (seg) ties.push(seg);
          for (const side of [b.left, b.right]) {
            const top = lift(side);
            if (top[1] - g > 0.4) { const post = C.segment(eye, top, [side[0], g, side[2]]); if (post) posts.push(post); }
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
      f.cars.forEach((car, n) => {
        if (n === f.follow) return;
        const segs = [], pts = f.roads[n];
        for (let i = 1; i < pts.length; i++) {
          if (!near(pts[i].p) || pts[i].s - pts[i - 1].s > 30) continue;
          const seg = C.segment(eye, lift(pts[i - 1].p), lift(pts[i].p));
          if (seg) segs.push(seg);
        }
        lines(segs, car.color, 1.5, 0.55);
      });
      lines(centre, target.color, 1.5, 0.55);

      // the cars, furthest first, each with a stick down to the ground under it
      const placed = new Map(f.rows.map(row => [row.car, row]));
      const shown = f.cars.map((car, n) => {
        const st = R.at(car, f.time), p = seat(st);
        const d = f.dirs[n] || [1, 0, 0], tip = C.norm([d[0], d[1] * ex, d[2]]) || d;
        return {car, p, tip, depth: C.project(eye, p)?.[2] ?? -1};
      }).filter(c => c.depth > 0 && near(c.p)).sort((a, b) => b.depth - a.depth);
      for (const {car, p, tip} of shown) {
        const segs = C.carEdges(p, tip).map(([a, b]) => C.segment(eye, a, b)).filter(Boolean);
        const stick = C.segment(eye, [p[0], p[1] - C.RIDE, p[2]], [p[0], g, p[2]]);
        if (stick && p[1] - C.RIDE - g > 0.4) lines([stick], car.color, 1, 0.6);
        const shadow = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [p[0] + u * 1.2, g, p[2] + v * 1.2]);
        lines(shadow.map((q, i) => C.segment(eye, q, shadow[(i + 1) % 4])).filter(Boolean), car.color, 1, 0.5);
        lines(segs, car.color, 2);
        const tag = C.project(eye, [p[0], p[1] + 1.8, p[2]]), row = placed.get(car);
        if (tag && tag[2] < 250 && row) {
          ctx.fillStyle = car.color; ctx.font = "600 12px system-ui, sans-serif"; ctx.textAlign = "center";
          ctx.fillText(`${row.place} ${f.label(car)}${row.place > 1 ? ` +${row.gap.toFixed(2)}` : ""}${car.estimated && row.state.finished ? " est." : ""}`, tag[0], tag[1]);
          ctx.textAlign = "start";
        }
      }
      return g;
    }
    /* forget the eased camera, so the next frame cuts straight to its car */
    const reset = () => { cam.yaw = null; cam.ground = null; };
    return {draw, reset};
  }

  root.ChaseView = {create};
})(globalThis);
