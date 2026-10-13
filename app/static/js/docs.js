// How it works: a wiggly track round the edge of the window with two cars on
// it. Decoration only. Drawn to the window's size, so it is rebuilt on resize;
// narrow windows keep the small circuit by the title instead.
(function () {
  'use strict';
  const svg = document.getElementById('st-edge');
  if (!svg || !window.CSS || !CSS.supports('offset-path', 'path("M0 0L1 1")')) return;
  const road = svg.querySelector('.st-race-road');
  const line = svg.querySelector('.st-race-line');
  const cars = svg.querySelectorAll('.st-car');
  const INSET = 17, RADIUS = 48, WOBBLE = 5, STEP = 6, SPEED = 130; // px, px/s

  function build() {
    const w = document.documentElement.clientWidth, h = window.innerHeight;
    const sx = w - 2 * (INSET + RADIUS), sy = h - 2 * (INSET + RADIUS);
    const on = w >= 760 && sx > 200 && sy > 200;
    document.body.classList.toggle('st-has-edge', on);
    if (!on) return;
    const arc = Math.PI * RADIUS / 2, total = 2 * (sx + sy) + 4 * arc;
    const waves = Math.max(8, Math.round(total / 150));
    // clockwise from the top-left corner's end: [length, point and inward normal at u]
    const x0 = INSET + RADIUS, x1 = w - x0, y0 = INSET + RADIUS, y1 = h - y0;
    const corner = (cx, cy, from) => [arc, u => {
      const a = from + u / RADIUS;
      return [cx + RADIUS * Math.cos(a), cy + RADIUS * Math.sin(a), -Math.cos(a), -Math.sin(a)];
    }];
    const parts = [
      [sx, u => [x0 + u, INSET, 0, 1]], corner(x1, y0, -Math.PI / 2),
      [sy, u => [w - INSET, y0 + u, -1, 0]], corner(x1, y1, 0),
      [sx, u => [x1 - u, h - INSET, 0, -1]], corner(x0, y1, Math.PI / 2),
      [sy, u => [INSET, y1 - u, 1, 0]], corner(x0, y0, Math.PI),
    ];
    const points = [];
    let done = 0;
    for (const [length, at] of parts) {
      for (let u = 0; u < length; u += STEP) {
        const [x, y, nx, ny] = at(u);
        const off = WOBBLE * Math.sin(2 * Math.PI * waves * (done + u) / total);
        points.push((x + nx * off).toFixed(1) + ' ' + (y + ny * off).toFixed(1));
      }
      done += length;
    }
    const d = 'M' + points.join('L') + 'Z';
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    road.setAttribute('d', d);
    line.setAttribute('d', d);
    for (const car of cars) {
      car.style.offsetPath = 'path("' + d + '")';
      car.style.animationDuration = (3 * total / SPEED).toFixed(1) + 's';  // three laps a cycle
    }
  }

  let pending = 0;
  window.addEventListener('resize', () => {
    clearTimeout(pending);
    pending = setTimeout(build, 150);
  });
  build();
})();
