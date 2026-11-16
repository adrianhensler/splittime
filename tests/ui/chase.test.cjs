"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), path = require("node:path");
const C = require(path.join(__dirname, "../../app/static/js/chase-model.js"));
const R = require(path.join(__dirname, "../../app/static/js/replay-model.js"));
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const seq = n => [...Array(n).keys()];
// a lap driving along +x at 10 m/s, climbing 1 m every second
const climb = R.car({lap:{id:1}, t:seq(21), dist:seq(21).map(i => i * 10),
  channels:{pos_x:seq(21).map(i => i * 10), pos_y:seq(21), pos_z:Array(21).fill(0),
    speed_kmh:Array(21).fill(36)}}, {time_s:20}, 0);

test("a car heading along +x sees -z on its right, as on the map", () => {
  const cam = C.camera([0, 0, 0], [10, 0, 0], Math.PI / 2, 200, 100);
  const [x, y] = C.project(cam, [10, 0, -5]);
  assert.ok(x > 100); close(y, 50);
  assert.ok(C.project(cam, [10, 5, 0])[1] < 50, "higher is further up the screen");
  assert.equal(C.project(cam, [-10, 0, 0]), null, "behind the camera is not drawn");
});
test("a segment crossing behind the camera is cut at the near plane", () => {
  const cam = C.camera([0, 0, 0], [10, 0, 0], Math.PI / 2, 200, 100);
  const seg = C.segment(cam, [-10, 0, 1], [10, 0, 1]);
  assert.ok(seg && seg.every(Number.isFinite));
  assert.equal(C.segment(cam, [-10, 0, 1], [-5, 0, 1]), null);
});
test("the road is laid every step along the route with edges either side on the level", () => {
  const road = C.road(climb, 20, 5);
  assert.deepEqual(road.map(q => q.s), [0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200]);
  close(road[1].p[1], 2 - C.RIDE);
  assert.deepEqual(road[1].left.map(Math.round), [20, 1, 5]);
  assert.deepEqual(road[1].right.map(Math.round), [20, 1, -5]);
  close(C.localLow(road, 100, 30), 8 - C.RIDE);
});
test("heading and slope come from the car's movement; standing still has none", () => {
  const d = C.heading(R, climb, 5);
  close(Math.atan2(d[2], d[0]), 0); close(C.slope(d), 10);
  const still = R.car({lap:{id:2}, t:[0, 1, 2], dist:[0, 0, 0], channels:{pos_x:[0, 0, 0], pos_y:[0, 0, 0],
    pos_z:[0, 0, 0], speed_kmh:[0, 0, 0]}}, {time_s:2}, 1);
  assert.equal(C.heading(R, still, 1), null);
});
test("the camera turns the short way round", () => {
  close(C.ease(3, -3, 1), -3 + 2 * Math.PI);
  assert.ok(C.ease(3, -3, 0.5) > 3);
});
test("the chase rig sits behind and above the car and looks ahead of it", () => {
  const {eye, target} = C.rig([0, 0, 0], 0, C.RIGS.chase);
  assert.ok(eye[0] < 0 && eye[1] > 0); assert.ok(target[0] > 0);
  const swung = C.rig([0, 0, 0], 0, C.RIGS.chase, Math.PI);
  assert.ok(swung.eye[0] > 0, "orbiting half round puts the camera in front");
});
test("a wireframe car is body, cabin and four wheels, wheels on the road", () => {
  const edges = C.carEdges([0, C.RIDE, 0], [1, 0, 0]);
  assert.equal(edges.length, 12 + 12 + 16);
  const lowest = Math.min(...edges.flat().map(p => p[1]));
  close(lowest, 0);
});
test("the game's angles become the car's axes: yaw on the level, nose up, right side down", () => {
  const z = C.basis(0), x = C.basis(Math.PI / 2);
  close(z.f[2], 1); close(x.f[0], 1);
  // level and unrolled, right matches the cameras' right (up x forward): -z for a car heading +x
  close(x.r[2], -1); close(x.u[1], 1);
  assert.ok(C.basis(0, 0.2).f[1] > 0, "a raised nose points the front up");
  const rolled = C.basis(0, 0, 0.3);
  assert.ok(rolled.r[1] < 0, "a positive roll drops the right side");
  close(Math.hypot(...rolled.u), 1);
});
const att = (yaw, pitch, roll) => R.car({lap:{id:5}, t:[0, 1, 2], dist:[0, 10, 20],
  channels:{pos_x:[0, 0, 0], pos_y:[0, 0, 0], pos_z:[0, 10, 20], speed_kmh:[36, 36, 36],
    raw_yaw:yaw, raw_pitch:pitch, raw_roll:roll}}, {time_s:2}, 0);
test("attitude follows the samples the short way round, with the nose stretched by height", () => {
  const a = C.attitude(R, att([0.1, 0.3, 0.5], [-0.1, -0.1, -0.1], [0, 0.2, 0.4]), 0.5);
  close(a.yaw, 0.2); close(a.nose, 0.1); close(a.roll, 0.1);
  const wrap = C.attitude(R, att([3.1, -3.1, -3.1], [0, 0, 0], [0, 0, 0]), 0.5);
  assert.ok(Math.abs(Math.abs(wrap.yaw) - Math.PI) < 0.05, "across +-pi it goes the short way");
  close(C.attitude(R, att([0, 0, 0], [-0.1, -0.1, -0.1], [0, 0, 0]), 1, 4).nose, Math.atan(Math.tan(0.1) * 4));
  assert.equal(C.attitude(R, climb, 1), null, "a lap loaded without angles has none");
});
test("a car is in the air inside one of its jumps; brake lights sit at the back", () => {
  const car = {jumps:[{dist0:100, dist1:140}]};
  assert.equal(C.airborne(car, 120), true); assert.equal(C.airborne(car, 150), false);
  assert.equal(C.airborne({}, 120), false);
  for (const [a] of C.brakeLights([0, 0, 0], C.basis(0))) assert.ok(a[2] < -2, "behind the car");
  assert.equal(R.car({lap:{id:6}, t:[0, 1], dist:[0, 1], channels:{pos_x:[0, 1], pos_y:[0, 0], pos_z:[0, 0],
    speed_kmh:[0, 0]}, jumps:[{dist0:0, dist1:1}]}, {}, 0).jumps.length, 1);
});
