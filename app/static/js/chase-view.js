"use strict";
/* Replay's Chase camera: the laps seen from behind one car, in 3D, drawn on a
   plain canvas. The maths is in chase-model.js; this file only draws. */
(function (root) {
  const R = root.ReplayModel, C = root.ChaseModel;
  const FAR = 450;   // metres of road drawn ahead; fades out toward it
  // Lines are batched by how far away they are, so distant road fades into the
  // background without a stroke per segment.
  const BANDS = [[90, 1], [180, 0.7], [300, 0.45], [FAR, 0.2]];
  const BRAKE = "#ff4d4d";   // brake lights: the same red whatever the theme
  const TOP = 48;            // the camera buttons sit above this: no labels there

  /* `css(name)` resolves a theme colour for the canvas. */
  function create(canvas, ctx, css) {
    const cam = {yaw: null, ground: null};
    const band = depth => BANDS.findIndex(([far]) => depth < far);
    function lines(segs, color, width, alpha = 1) {
      if (!segs.length) return;
      ctx.strokeStyle = color; ctx.lineWidth = width;
      for (let b = 0; b < BANDS.length; b++) {
        ctx.beginPath();
        let any = false;
        for (const s of segs) if (band(s[4]) === b) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); any = true; }
        if (any) { ctx.globalAlpha = BANDS[b][1] * alpha; ctx.stroke(); }
      }
      ctx.globalAlpha = 1;
    }
    // quads as [x0,y0,...,x3,y3, depth], one fill per distance band
    function fills(quads, color, alpha) {
      ctx.fillStyle = color;
      for (let b = 0; b < BANDS.length; b++) {
        ctx.beginPath();
        let any = false;
        for (const q of quads) if (band(q[8]) === b) {
          ctx.moveTo(q[0], q[1]); ctx.lineTo(q[2], q[3]); ctx.lineTo(q[4], q[5]); ctx.lineTo(q[6], q[7]); ctx.closePath(); any = true;
        }
        if (any) { ctx.globalAlpha = BANDS[b][1] * alpha; ctx.fill(); }
      }
      ctx.globalAlpha = 1;
    }
    function polygon(pts) {
      ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
    }
    function tag(text, x, y, color, bg) {
      ctx.font = "600 11px system-ui, sans-serif";
      const w = ctx.measureText(text).width + 8;
      ctx.fillStyle = bg; ctx.globalAlpha = 0.85; ctx.fillRect(x - w / 2, y - 15, w, 16); ctx.globalAlpha = 1;
      ctx.fillStyle = color; ctx.textAlign = "center"; ctx.fillText(text, x, y - 3); ctx.textAlign = "start";
    }

    // Sky above the horizon, a faint glow toward the top; the ground stays the panel.
    function sky(eye, w, h) {
      const hy = C.horizon(eye);
      if (hy === null || hy <= 0) return;
      const y = Math.min(hy, h), grad = ctx.createLinearGradient(0, 0, 0, y);
      grad.addColorStop(0, css("--st-accent")); grad.addColorStop(1, css("--st-panel"));
      ctx.globalAlpha = 0.16; ctx.fillStyle = grad; ctx.fillRect(0, 0, w, y); ctx.globalAlpha = 1;
      if (hy < h) { ctx.fillStyle = css("--st-muted"); ctx.globalAlpha = 0.25; ctx.fillRect(0, hy, w, 1); ctx.globalAlpha = 1; }
    }

    // A car as solid faces: the followed car fully, the others as ghosts.
    function solid(eye, p, way, color, ghost, brake) {
      const light = C.norm(C.sub([0, 0.8, 0], C.mul(eye.f, 0.6)));
      const faces = C.carFaces(p, way).filter(face => C.facing(eye, face))
        .map(face => ({face, scr: face.pts.map(q => C.project(eye, q))}))
        .filter(({scr}) => scr.every(Boolean))
        .sort((a, b) => b.scr.reduce((s, q) => s + q[2], 0) - a.scr.reduce((s, q) => s + q[2], 0));
      const dark = css("--st-bg");
      for (const {face, scr} of faces) {
        polygon(scr);
        const wheel = face.part === "wheel";
        ctx.fillStyle = wheel ? dark : color;
        ctx.globalAlpha = ghost ? 0.22 : 1; ctx.fill();
        if (!ghost && !wheel) {   // shade by how much the face looks toward the light
          const lit = Math.max(0, face.n[0] * light[0] + face.n[1] * light[1] + face.n[2] * light[2]);
          ctx.fillStyle = "#000"; ctx.globalAlpha = 0.45 * (1 - lit); ctx.fill();
        }
        ctx.globalAlpha = ghost ? 0.6 : 0.5; ctx.strokeStyle = ghost ? color : dark; ctx.lineWidth = ghost ? 1.2 : 1;
        ctx.stroke(); ctx.globalAlpha = 1;
        if (face.part === "rear" && brake > 5) {
          const lit = C.brakeLights(p, way).map(([a, b]) => C.segment(eye, a, b)).filter(Boolean);
          lines(lit, BRAKE, 3.5, (ghost ? 0.5 : 1) * (0.35 + 0.65 * Math.min(1, brake / 100)));
        }
      }
    }

    /* f: {cars, roads, dirs, time, follow, rig, orbit, raise, zoom, exag, dt,
       rows, label, pins, current, gear}. dt > 0 eases the camera round; 0 (a
       scrub, a new car) cuts straight there. Returns the ground level, for
       the height strip. */
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
      // a stretch in the air is drawn dotted, and only well in front of the camera:
      // the arc behind a jump passes over the camera and would streak off the top
      const flight = (a, b) => {
        const pa = C.project(eye, a), pb = C.project(eye, b);
        return pa && pb && pa[2] > 5 && pb[2] > 5 ? [pa[0], pa[1], pb[0], pb[1], (pa[2] + pb[2]) / 2] : null;
      };

      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round";
      sky(eye, w, h);
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

      // the followed car's road: a surface, its edges, centre dashes, and posts to the ground
      const edges = [], dashes = [], posts = [], quads = [], flights = [];
      for (let i = 1; i < road.length; i++) {
        const a = road[i - 1], b = road[i];
        if (!near(a.p) || !near(b.p) || b.s - a.s > 30) continue;
        if (a.air || b.air) { const seg = flight(lift(a.p), lift(b.p)); if (seg) flights.push(seg); continue; }
        const corners = [a.left, b.left, b.right, a.right].map(p => C.project(eye, lift(p)));
        if (corners.every(Boolean)) quads.push([...corners.flatMap(c => [c[0], c[1]]), Math.max(...corners.map(c => c[2]))]);
        for (const [p, q] of [[a.left, b.left], [a.right, b.right]]) {
          const seg = C.segment(eye, lift(p), lift(q));
          if (seg) edges.push(seg);
        }
        if (i % 2 === 0) {
          const seg = C.segment(eye, lift(a.p), lift(b.p));
          if (seg) dashes.push(seg);
          for (const side of [b.left, b.right]) {
            const top = lift(side);
            if (top[1] - g > 0.4) { const post = C.segment(eye, top, [side[0], g, side[2]]); if (post) posts.push(post); }
          }
        }
      }
      lines(posts, css("--st-accent"), 1, 0.3);
      fills(quads, css("--st-line"), 0.6);
      lines(edges, css("--st-fg"), 1.6, 0.75);
      lines(dashes, css("--st-muted"), 1.5, 0.6);
      ctx.setLineDash([2, 6]); lines(flights, target.color, 2, 0.8); ctx.setLineDash([]);
      // everyone else's line on the same road, in their colour
      f.cars.forEach((car, n) => {
        if (n === f.follow) return;
        const segs = [], air = [], pts = f.roads[n];
        for (let i = 1; i < pts.length; i++) {
          if (!near(pts[i].p) || pts[i].s - pts[i - 1].s > 30) continue;
          if (pts[i].air || pts[i - 1].air) { const seg = flight(lift(pts[i - 1].p), lift(pts[i].p)); if (seg) air.push(seg); continue; }
          const seg = C.segment(eye, lift(pts[i - 1].p), lift(pts[i].p));
          if (seg) segs.push(seg);
        }
        lines(segs, car.color, 1.5, 0.55);
        ctx.setLineDash([2, 6]); lines(air, car.color, 1.5, 0.5); ctx.setLineDash([]);
      });

      // corner signs at each apex: a pole and its number, the leader's corner lit
      for (const pin of f.pins || []) {
        const base = lift([pin.x, pin.y - C.RIDE, pin.z]);
        if (Math.hypot(base[0] - pos[0], base[2] - pos[2]) > 300) continue;
        const top = [base[0], base[1] + 3, base[2]], pole = C.segment(eye, base, top), at = C.project(eye, top);
        if (!pole || !at || at[2] < 3) continue;
        const lit = pin.corner === f.current, color = css(lit ? "--st-accent" : "--st-muted");
        lines([pole], color, 1.5, 0.9);
        if (at[1] > TOP) tag(`C${Number(pin.corner.n)}`, at[0], at[1], color, css("--st-bg"));
      }

      // the cars, furthest first, each with a stick down to the ground under it
      const placed = new Map(f.rows.map(row => [row.car, row]));
      const shown = f.cars.map((car, n) => {
        const st = R.at(car, f.time), p = seat(st);
        // how the car really sat (yaw, nose, roll); level along its travel if not recorded
        const att = C.attitude(R, car, f.time, ex), d = f.dirs[n] || [1, 0, 0];
        const way = att ? C.basis(att.yaw, att.nose, att.roll) : C.norm([d[0], d[1] * ex, d[2]]) || d;
        return {car, n, p, way, brake: st.brake ?? 0, air: !st.finished && C.airborne(car, st.dist),
          depth: C.project(eye, p)?.[2] ?? -1};
      }).filter(c => c.depth > 0 && near(c.p)).sort((a, b) => b.depth - a.depth);
      for (const {car, n, p, way, brake, air} of shown) {
        const stick = C.segment(eye, [p[0], p[1] - C.RIDE, p[2]], [p[0], g, p[2]]);
        if (stick && air) {
          // in the air: the drop to the ground, dashed and bright
          ctx.setLineDash([4, 4]); lines([stick], css("--st-accent"), 1.5, 0.9); ctx.setLineDash([]);
        } else if (stick && p[1] - C.RIDE - g > 0.4) lines([stick], car.color, 1, 0.6);
        const shadow = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => C.project(eye, [p[0] + u * 1.2, g, p[2] + v * 1.6]));
        if (shadow.every(Boolean)) { polygon(shadow); ctx.fillStyle = "#000"; ctx.globalAlpha = 0.25; ctx.fill(); ctx.globalAlpha = 1; }
        solid(eye, p, way, car.color, n !== f.follow, brake);
        const at = C.project(eye, [p[0], p[1] + 1.8, p[2]]), row = placed.get(car);
        if (at && at[2] < 250 && at[1] > TOP && row) {
          ctx.fillStyle = car.color; ctx.font = "600 12px system-ui, sans-serif"; ctx.textAlign = "center";
          ctx.fillText(`${row.place} ${f.label(car)}${row.place > 1 ? ` +${row.gap.toFixed(2)}` : ""}${car.estimated && row.state.finished ? " est." : ""}${air ? " · air" : ""}`, at[0], at[1]);
          ctx.textAlign = "start";
        }
      }
      hud(f, s, w, h);
      return g;
    }

    // Bottom right: the followed car's speed, gear and place.
    function hud(f, s, w, h) {
      const row = f.rows.find(r => r.car === f.cars[f.follow]);
      if (!row) return;
      const place = row.place === 1 ? (s.finished ? "Finished first" : "Ahead") : `${row.place}. +${row.gap.toFixed(2)} s`;
      const bw = 150, bh = 58, x = w - bw - 10, y = h - bh - 10;
      ctx.fillStyle = css("--st-bg"); ctx.globalAlpha = 0.8; ctx.fillRect(x, y, bw, bh); ctx.globalAlpha = 1;
      ctx.fillStyle = css("--st-fg"); ctx.font = "700 24px system-ui, sans-serif";
      ctx.fillText(String(Math.round(s.speed)), x + 10, y + 28);
      const sw = ctx.measureText(String(Math.round(s.speed))).width;
      ctx.font = "12px system-ui, sans-serif"; ctx.fillStyle = css("--st-muted");
      ctx.fillText("km/h", x + 14 + sw, y + 28);
      ctx.font = "700 20px system-ui, sans-serif"; ctx.fillStyle = f.cars[f.follow].color; ctx.textAlign = "end";
      ctx.fillText(f.gear(s.gear), x + bw - 10, y + 28); ctx.textAlign = "start";
      ctx.font = "12px system-ui, sans-serif"; ctx.fillStyle = css("--st-muted");
      ctx.fillText(place, x + 10, y + 48);
    }
    /* forget the eased camera, so the next frame cuts straight to its car */
    const reset = () => { cam.yaw = null; cam.ground = null; };
    return {draw, reset};
  }

  root.ChaseView = {create};
})(globalThis);
