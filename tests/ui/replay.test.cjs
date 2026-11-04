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
test("playback runs on the game's lap clock, not on packet arrival", () => {
  const data = lap(4,10,11);
  data.t = [0,1,2,3,4,9,10,11,12,13,14];              // the stream stalled for 4 s
  data.channels.lap_time = seq(11).map(i => i + 0.5); // the game clock did not
  const car = R.car(data,{time_s:10},0);
  assert.deepEqual(car.t,seq(11)); assert.equal(R.at(car,7).x,70);
  const none = lap(5,10,11); assert.equal(R.car(none,{time_s:10},0).t,none.t);
});
test("the gap uses the first time the leader reached a spot, across a standstill", () => {
  const data = lap(6,10,11);
  data.dist = [0,10,20,30,30,30,30,40,50,60,70];      // stood still for 3 s at 30
  const stopped = R.car(data,{time_s:10},0);
  assert.equal(R.timeAtDist(stopped,30),3); assert.equal(R.timeAtDist(stopped,35),6.5);
  assert.equal(R.timeAtDist(stopped,0),0); assert.equal(R.timeAtDist(stopped,999),10);
});
test("a last-packet finish is carried as estimated", () => {
  assert.equal(R.car(lap(7,10,11),{time_s:10,finish:"last_packet"},0).estimated,true);
  assert.equal(fast.estimated,false);
});
test("a run's clock starts at the launch, and the dot stops at the recorded time", () => {
  const data = lap(8,10,14);
  data.dist = [0,0,0,0,10,20,30,40,50,60,70,80,80,80];  // 3 s on the grid, 2 frames after the line
  data.channels.pos_x = data.dist;
  const run = R.car(data,{time_s:8},0);
  assert.equal(run.t[0],0); assert.equal(R.at(run,4).x,40);
  assert.equal(R.at(run,8).x,80); assert.equal(R.at(run,12).x,80); assert.equal(R.at(run,12).finished,true);
});
test("a run-up from before the start line is not part of the timed run", () => {
  const data = lap(9,10,13);
  data.dist = [-30,-20,-10,0,10,20,30,40,50,60,70,80,90];
  data.channels.pos_x = data.dist;
  const run = R.car(data,{time_s:9},0);
  assert.equal(run.t[0],0); assert.equal(R.at(run,0).x,0); assert.equal(R.at(run,9).x,90);
});

// ---- corners and stretches of road (ADR 40) ---------------------------------
const CORNERS = [{n:1,kind:"sweeper",s_entry:10,s_apex:20,s_exit:30},{n:2,kind:"hairpin",s_entry:60,s_apex:70,s_exit:80}];
test("a route position is in a corner or on a straight", () => {
  assert.equal(R.cornerAt(CORNERS,20).n,1); assert.equal(R.cornerAt(CORNERS,30).n,1);
  assert.equal(R.cornerAt(CORNERS,45),null); assert.equal(R.cornerAt([],20),null);
  assert.equal(R.cornerAt(undefined,20),null);
});
test("a pin sits where the recorded lap passed the apex", () => {
  const pins = R.markers([fast],CORNERS);
  assert.equal(pins[0].x,20); assert.equal(pins[1].x,70); assert.equal(pins[1].corner.n,2);
  assert.deepEqual(R.markers([fast],undefined),[]);
});
test("a lap cut off partway does not answer for road it never drove", () => {
  const cut = R.car(lap(10,10,4),{time_s:3},0);            // stops at 30, before corner 2
  const pins = R.markers([cut,fast],CORNERS);
  assert.equal(pins[0].x,20); assert.equal(pins[1].x,70);  // corner 2 read from the full lap
  assert.deepEqual(R.markers([cut],CORNERS).map(p => p.corner.n),[1]);  // no lap reached corner 2
  assert.equal(R.carOver([cut,fast],70),fast); assert.equal(R.carOver([cut,fast],20),cut);
  assert.equal(R.carOver([cut,fast],999),fast);            // nobody drove it all: whoever got furthest
});
test("a stretch in the address is two numbers in order and a checked name", () => {
  assert.deepEqual(R.parseAt("?laps=1,2&at=-80.5,120&name=S3"),{from:-80.5,to:120,name:"S3"});
  assert.deepEqual(R.parseAt("?at=10,20&name=C7"),{from:10,to:20,name:"C7"});
  assert.equal(R.parseAt("?at=10,20&name=<img>").name,null);
  for (const bad of ["?laps=1,2","?at=20,10","?at=10,10","?at=x,20","?at=10","?at=1,2,3","?at=Infinity,1","?at=1e9,2e9"])
    assert.equal(R.parseAt(bad),null,bad);
});
test("a clip runs from before the first car arrives until the last has left", () => {
  // fast reaches 40 at 4 s and 60 at 6 s; slow reaches them at 8 s and 12 s
  assert.deepEqual(R.clip([fast,slow],40,60),{start:1,end:13});
  assert.equal(R.clip([fast,slow],5,10).start,0);               // never before the start
  assert.equal(R.clip([fast,slow],90,100).end,20);              // never past the longest lap
  assert.equal(R.clip([fast,slow],500,600),null);               // nobody got there
});
test("a stretch is framed on the road, never closer than the smallest view", () => {
  const f = R.focus(fast,20,40);
  assert.equal(f.cx,35); assert.equal(f.width,250); assert.equal(f.height,250);
  assert.deepEqual(R.span(fast,20,40),[2,5]);
});
test("the caption names the quicker lap, and never a turn direction", () => {
  const seg = {dt:0.2144,a:{min_kmh:112.4},b:{min_kmh:107.6}};
  assert.equal(R.caption(CORNERS[0],seg,"Ann","Bo"),"C1 · sweeper · Ann +0.214 s · min 112 / 108 km/h");
  assert.equal(R.caption(CORNERS[0],{...seg,dt:-0.5},"Ann","Bo"),"C1 · sweeper · Bo +0.500 s · min 112 / 108 km/h");
  assert.equal(R.caption(CORNERS[0],{dt:0.1,a:{min_kmh:null},b:{min_kmh:90}},"Ann","Bo"),"C1 · sweeper · Ann +0.100 s");
  assert.equal(R.caption(CORNERS[0],undefined,"Ann","Bo"),"C1 · sweeper");
  assert.equal(R.caption({...CORNERS[0],direction:"R"},undefined,"Ann","Bo"),"C1 · sweeper");
  // a corner only partly on the shared stretch has no comparable time
  assert.equal(R.caption(CORNERS[0],{...seg,partial:true},"Ann","Bo"),"C1 · sweeper");
  assert.equal(R.caption(null,seg,"Ann","Bo"),"");
});
test("stretch names read as the report writes them", () => {
  assert.equal(R.nameOf("S3"),"Section 3"); assert.equal(R.nameOf("C7"),"C7"); assert.equal(R.nameOf(null),"this stretch");
});
test("the run-up to a stretch is known until the stretch has played", () => {
  const stretch = {from:40,armed:true};
  assert.equal(R.approaching(stretch,39),true); assert.equal(R.approaching(stretch,40),false);
  assert.equal(R.approaching({...stretch,armed:false},39),false); assert.equal(R.approaching(null,39),false);
});
