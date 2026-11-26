"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm");
const C = require("../../app/static/js/chase-model.js"), R = require("../../app/static/js/replay-model.js");

test("only the followed lap uses the GT, with the simple car drawn when it is unavailable", () => {
  const simple = [], detailed = [];
  const context = {ReplayModel: R, ChaseModel: {...C, carFaces(p, way) {
    simple.push(p[2]); return C.carFaces(p, way);
  }}};
  vm.runInNewContext(fs.readFileSync("app/static/js/chase-view.js", "utf8"), context);
  const ctx = new Proxy({measureText: () => ({width: 24}), createLinearGradient: () => ({addColorStop() {}})},
    {get: (target, key) => target[key] ?? (() => {})});
  const view = context.ChaseView.create({clientWidth: 800, clientHeight: 480}, ctx, () => "#000");
  const cars = [0, 1, 2].map(i => R.car({lap: {id: i + 1}, t: [0, 1], dist: [0, 10 + i],
    channels: {pos_x: [0, 10], pos_y: [1, 1], pos_z: [i, i], speed_kmh: [36, 36], brake: [0, 10 * i]}},
    {time_s: 1}, i));
  const frame = {cars, roads: cars.map(car => C.road(car)), dirs: [], time: 0.5, follow: 0,
    rig: "chase", orbit: 0, raise: 0, zoom: 1, exag: 1, dt: 0,
    rows: R.standings(cars, 0.5), label: car => String(car.id), gear: () => ""};
  function check(follow, ready) {
    detailed.length = simple.length = 0;
    const drawGT = (_ctx, _eye, p, _way, colour, brake, distance) => {
      detailed.push({z: p[2], colour, brake, distance}); return ready;
    };
    view.draw({...frame, follow, drawGT});
    assert.deepEqual(detailed, [{z: follow, colour: cars[follow].color, brake: 5 * follow, distance: (10 + follow) / 2}]);
    assert.deepEqual(simple.sort(), [0, 1, 2].filter(i => !ready || i !== follow));
  }
  check(0, true);
  check(2, true);
  check(2, false);
});
