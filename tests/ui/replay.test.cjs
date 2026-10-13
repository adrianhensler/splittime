"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), path = require("node:path");
const R = require(path.join(__dirname,"../../app/static/js/replay-model.js"));
const seq = n => [...Array(n).keys()];
const lap = (id,speed,n) => ({lap:{id}, t:seq(n), dist:seq(n).map(i => i*speed),
  channels:{pos_x:seq(n).map(i => i*speed), pos_y:Array(n).fill(0), pos_z:Array(n).fill(0),
    speed_kmh:Array(n).fill(speed*3.6)}});
const fast = R.car(lap(1,10,11),{time_s:10,driver_name:"A"},0);
const slow = R.car(lap(2,5,21),{time_s:20,driver_name:"B"},1);
test("the car further along leads; the gap is the time to reach the leader's spot", () => {
  const rows = R.standings([slow,fast],4);
  assert.equal(rows[0].car.id,1); assert.equal(rows[1].gap,2);
});
test("a finished car stays ahead and the final gap is the difference in lap times", () => {
  assert.equal(R.standings([slow,fast],15)[0].state.finished,true);
  assert.equal(R.standings([slow,fast],25)[1].gap,10);
});
test("positions interpolate between samples; three cars rank in order", () => {
  assert.equal(R.at(fast,2.5).x,25);
  const mid = R.car(lap(3,8,14),{time_s:12.5},2);
  assert.deepEqual(R.standings([slow,mid,fast],5).map(r => r.car.id),[1,3,2]);
});
test("lap ids from the address are positive integers, de-duplicated and capped", () => {
  assert.deepEqual(R.parseLaps("?laps=3,3,x,-1,7"),[3,7]);
  assert.equal(R.parseLaps("?laps=1,2,3,4,5,6,7,8").length,R.COLORS.length);
});
test("top view puts x to the right and z up the screen", () => {
  const p = R.projector({cx:0,cz:0,cy:0,yaw:0,pitch:0,anchor:0.5,panX:0,panY:0,relief:1,scale:1},200,100);
  assert.deepEqual(p(10,0,0),[110,50]); assert.deepEqual(p(0,0,10),[100,40]);
});
