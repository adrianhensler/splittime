"use strict";
// Behaviour of the Live page's per-driver feeds (app/static/js/livefeeds.js):
// two drivers at once, each reconnecting on its own, one shown in detail.
// Everything the browser supplies is faked here; nothing touches a network.
const test = require("node:test"), assert = require("node:assert/strict");
const path = require("node:path");
const LiveFeeds = require(path.join(__dirname, "../../app/static/js/livefeeds.js"));

const DRIVERS = [{ id: "alpha", name: "Driver Alpha" }, { id: "beta", name: "Driver Beta" }];
const PAGE = { protocol: "http:", host: "localhost:8100", href: "http://localhost:8100/index.html" };

function frame(over) {
  return JSON.stringify({ is_race_on: 1, race_mode: true, speed: 50, current_lap: 12.5,
    last_lap: 0, best_lap: 0, lap_number: 0, race_position: 1, ...over });
}

function rig(options = {}) {
  const env = {
    t: 0, hidden: false, sockets: [], timers: [], detailFrames: [], resets: [], changes: [],
    log: [],
  };
  env.feeds = LiveFeeds.createLiveFeeds({
    drivers: options.drivers || DRIVERS,
    detail: options.detail,
    location: options.location || PAGE,
    makeSocket(url) {
      const ws = { url, closed: false, close() { this.closed = true; } };
      env.sockets.push(ws);
      return ws;
    },
    now: () => env.t,
    setTimer(fn, ms) { const timer = { fn, ms, cleared: false }; env.timers.push(timer); return timer; },
    clearTimer(timer) { timer.cleared = true; },
    isHidden: () => env.hidden,
    onDetailFrame(f, id) { env.detailFrames.push([id, f]); env.log.push("frame:" + id); },
    onDetailReset(id) { env.resets.push(id); env.log.push("reset:" + id); },
    onChange(id) { env.changes.push(id); },
  });
  env.socket = (id) => env.sockets.filter((ws) => ws.url.endsWith("driver=" + id)).at(-1);
  env.open = (id) => env.socket(id).onopen();
  env.send = (id, over) => env.socket(id).onmessage({ data: frame(over) });
  env.kind = (id) => env.feeds.status(id).kind;
  env.runTimers = () => {
    const due = env.timers.filter((timer) => !timer.cleared && !timer.ran);
    due.forEach((timer) => { timer.ran = true; timer.fn(); });
    return due.length;
  };
  return env;
}

test("socket URLs are same-origin, relative to the page, wss under HTTPS and name the driver", () => {
  const url = LiveFeeds.liveSocketUrl;
  assert.equal(url(PAGE, "alpha"), "ws://localhost:8100/ws/live?driver=alpha");
  assert.equal(url({ protocol: "http:", host: "localhost:8100", href: "http://localhost:8100/" }, "alpha"),
    "ws://localhost:8100/ws/live?driver=alpha");
  const prefixed = { protocol: "https:", host: "test.example", href: "https://test.example/splittime/index.html?driver=beta" };
  assert.equal(url(prefixed, "captn-compass"), "wss://test.example/splittime/ws/live?driver=captn-compass");
  assert.equal(url({ ...prefixed, href: "https://test.example/splittime/" }, "a"),
    "wss://test.example/splittime/ws/live?driver=a");
  // an id is data, not URL syntax
  assert.equal(url(PAGE, "a b&c"), "ws://localhost:8100/ws/live?driver=a%20b%26c");
  // legacy single feed: no query, the server's first driver
  assert.equal(url(PAGE, null), "ws://localhost:8100/ws/live");
});

test("both drivers are subscribed at once and summarised independently", () => {
  const env = rig();
  env.feeds.start();
  assert.deepEqual(env.sockets.map((ws) => ws.url),
    ["ws://localhost:8100/ws/live?driver=alpha", "ws://localhost:8100/ws/live?driver=beta"]);
  assert.equal(env.kind("alpha"), "connecting");
  env.open("alpha"); env.open("beta");
  // connected is not the same as receiving: no "live" or "paused" before a frame
  assert.equal(env.kind("alpha"), "waiting");
  assert.equal(env.kind("beta"), "waiting");
  assert.match(env.feeds.status("beta").sentence, /^Waiting for Driver Beta telemetry/);

  env.send("alpha", { speed: 61, race_mode: true });
  env.send("beta", { speed: 22, race_mode: false });
  assert.equal(env.kind("alpha"), "racing");
  assert.equal(env.kind("beta"), "free-roam");
  assert.equal(env.feeds.summary("alpha").speed, 61);
  assert.equal(env.feeds.summary("beta").speed, 22);
  assert.equal(env.feeds.status("alpha").sentence, "");
  // only the detail driver's frames reach the gauges
  assert.deepEqual(env.detailFrames.map(([id]) => id), ["alpha"]);
});

test("status text never carries an address or a port", () => {
  const env = rig();
  env.feeds.start();
  const texts = [];
  for (const kind of ["connecting", "reconnecting", "waiting", "paused", "racing"])
    texts.push(LiveFeeds.describe(kind, "Driver Alpha"));
  env.open("alpha");
  texts.push(env.feeds.status("alpha").sentence, env.feeds.status("alpha").label);
  for (const text of texts) assert.doesNotMatch(text, /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|\b\d{4,5}\b|UDP|port/i);
});

test("switching the detail driver resets first, then shows only the new driver's frames", () => {
  const env = rig();
  env.feeds.start();
  assert.deepEqual(env.resets, ["alpha"]);   // the page starts from a clean slate
  env.open("alpha"); env.open("beta");
  env.send("alpha", { speed: 61 });
  env.send("beta", { speed: 22 });
  env.log.length = 0;

  assert.equal(env.feeds.selectDetail("beta"), true);
  // reset comes before any beta frame, and beta's own current frame follows at once
  assert.deepEqual(env.log, ["reset:beta", "frame:beta"]);
  assert.equal(env.detailFrames.at(-1)[1].speed, 22);

  env.send("alpha", { speed: 99 });           // alpha keeps streaming
  env.t += 5; env.send("beta", { speed: 23 });
  assert.deepEqual(env.log, ["reset:beta", "frame:beta", "frame:beta"]);
  assert.ok(env.detailFrames.slice(1).every(([id]) => id === "beta"), "an alpha frame reached beta's gauges");

  // no socket was opened or closed by the switch
  assert.equal(env.sockets.length, 2);
  assert.ok(env.sockets.every((ws) => !ws.closed));
  // choosing the same driver, or one that does not exist, changes nothing
  assert.equal(env.feeds.selectDetail("beta"), false);
  assert.equal(env.feeds.selectDetail("nobody"), false);
  assert.equal(env.feeds.detail(), "beta");
});

test("switching to a paused driver starts blank instead of replaying an old frame", () => {
  const env = rig();
  env.feeds.start();
  env.open("alpha"); env.open("beta");
  env.send("beta", { speed: 22 });
  env.t += LiveFeeds.STALE_MS + 1;
  env.send("alpha", { speed: 61 });
  assert.equal(env.kind("beta"), "paused");
  env.log.length = 0;
  env.feeds.selectDetail("beta");
  assert.deepEqual(env.log, ["reset:beta"]);
  assert.match(env.feeds.status("beta").sentence, /^Driver Beta's telemetry is paused/);
});

test("one driver dropping and reconnecting does not disturb the other", () => {
  const env = rig();
  env.feeds.start();
  env.open("alpha"); env.open("beta");
  env.send("alpha"); env.send("beta");
  const alphaSocket = env.socket("alpha");

  env.socket("beta").onclose();
  assert.equal(env.kind("beta"), "reconnecting");
  assert.equal(env.kind("alpha"), "racing");
  assert.equal(env.timers.length, 1);
  assert.equal(env.timers[0].ms, LiveFeeds.RECONNECT_MIN);

  env.t += LiveFeeds.STALE_MS + 100; env.send("alpha", { speed: 70 });
  assert.equal(env.feeds.summary("alpha").speed, 70);

  assert.equal(env.runTimers(), 1);
  assert.equal(env.sockets.length, 3);                 // one new socket, for beta only
  assert.equal(env.socket("alpha"), alphaSocket);
  assert.ok(!alphaSocket.closed);
  env.open("beta");
  assert.equal(env.kind("beta"), "paused");            // back, but nothing new received yet
  env.send("beta");
  assert.equal(env.kind("beta"), "racing");
});

test("reconnect delay doubles to a ceiling and resets after a successful open", () => {
  const env = rig({ drivers: [DRIVERS[0]] });
  env.feeds.start();
  const delays = [];
  for (let i = 0; i < 6; i++) {
    env.socket("alpha").onclose();
    delays.push(env.timers.at(-1).ms);
    env.runTimers();
  }
  assert.deepEqual(delays, [1500, 3000, 6000, 12000, 15000, 15000]);
  env.open("alpha");
  env.socket("alpha").onclose();
  assert.equal(env.timers.at(-1).ms, 1500);
  // never more than one pending reconnect or one live socket for a driver
  assert.equal(env.timers.filter((timer) => !timer.ran && !timer.cleared).length, 1);
});

test("an error closes that socket and callbacks from a replaced socket are ignored", () => {
  const env = rig();
  env.feeds.start();
  env.open("alpha"); env.open("beta");
  const old = env.socket("beta");
  old.onerror();
  assert.ok(old.closed);
  old.onclose();
  env.runTimers();
  const fresh = env.socket("beta");
  assert.notEqual(fresh, old);
  env.open("beta");
  env.feeds.selectDetail("beta");
  const before = env.detailFrames.length, changes = env.changes.length, timers = env.timers.length;

  // the superseded socket speaks late: nothing may change
  old.onmessage({ data: frame({ speed: 999 }) });
  old.onopen();
  old.onclose();
  old.onerror();
  assert.equal(env.detailFrames.length, before);
  assert.equal(env.changes.length, changes);
  assert.equal(env.timers.length, timers);
  assert.equal(env.feeds.summary("beta"), null);
  assert.equal(env.kind("beta"), "waiting");
  assert.equal(env.socket("beta"), fresh);
});

test("stop cancels reconnects, closes sockets and silences late callbacks", () => {
  const env = rig();
  env.feeds.start();
  env.open("alpha"); env.open("beta");
  env.send("alpha");
  env.socket("beta").onclose();
  const [alphaSocket] = env.sockets;
  const handlers = { message: alphaSocket.onmessage, close: alphaSocket.onclose };
  const frames = env.detailFrames.length;

  env.feeds.stop();
  assert.ok(alphaSocket.closed);
  assert.ok(env.timers.every((timer) => timer.cleared));
  assert.equal(alphaSocket.onmessage, null);
  // a browser can still deliver an event that was already queued
  handlers.message({ data: frame({ speed: 5 }) });
  handlers.close();
  env.timers.forEach((timer) => timer.fn());            // even a timer that fires anyway
  assert.equal(env.detailFrames.length, frames);
  assert.equal(env.sockets.length, 2);
  assert.equal(env.feeds.selectDetail("beta"), false);
  env.feeds.start();                                     // and it does not restart
  assert.equal(env.sockets.length, 2);
});

test("waiting, live, paused and back follow packet arrival, not the tab", () => {
  const env = rig();
  env.feeds.start();
  env.open("alpha");
  assert.equal(env.kind("alpha"), "waiting");
  env.send("alpha");
  assert.equal(env.kind("alpha"), "racing");
  env.t += LiveFeeds.STALE_MS;
  assert.equal(env.kind("alpha"), "racing");
  env.t += 1;
  assert.equal(env.kind("alpha"), "paused");
  assert.equal(env.feeds.status("alpha").fresh, false);

  // hidden tab: frames are not parsed or drawn, but they still count as arriving
  env.hidden = true;
  const parsed = env.detailFrames.length;
  env.send("alpha", { speed: 80 });
  assert.equal(env.detailFrames.length, parsed);
  assert.equal(env.feeds.summary("alpha").speed, 50);
  assert.equal(env.kind("alpha"), "racing");

  // the game pauses while the tab is hidden; coming back must not call the
  // old frame fresh just because the tab is visible again
  env.t += LiveFeeds.STALE_MS + 1;
  env.hidden = false;
  assert.equal(env.kind("alpha"), "paused");
  env.send("alpha", { speed: 81 });
  assert.equal(env.kind("alpha"), "racing");
  assert.equal(env.detailFrames.at(-1)[1].speed, 81);
});

test("a driver who is not shown in detail is parsed at summary rate only", () => {
  const env = rig();
  let parses = 0;
  env.feeds = null;
  const feeds = LiveFeeds.createLiveFeeds({
    drivers: DRIVERS, location: PAGE,
    makeSocket(url) { const ws = { url, close() {} }; env.sockets.push(ws); return ws; },
    now: () => env.t, setTimer: () => ({}), clearTimer() {},
    parse(text) { parses++; return JSON.parse(text); },
  });
  feeds.start();
  const beta = env.sockets[1];
  beta.onopen();
  for (let i = 0; i < 140; i++) { env.t += 1000 / 140; beta.onmessage({ data: frame({ speed: i }) }); }
  assert.ok(parses >= 4 && parses <= 6, `one second at 140 Hz parsed ${parses} times`);
  assert.equal(feeds.status("beta").kind, "racing");
});

test("malformed or foreign messages are dropped without breaking the feed", () => {
  const env = rig();
  env.feeds.start();
  env.open("alpha");
  env.socket("alpha").onmessage({ data: "{not json" });
  env.socket("alpha").onmessage({ data: "null" });
  assert.equal(env.detailFrames.length, 0);
  env.t += 1; env.send("alpha", { speed: 33 });
  assert.equal(env.detailFrames.at(-1)[1].speed, 33);
});

test("a single-driver install and a duplicated driver list each get exactly one feed", () => {
  const legacy = rig({ drivers: [{ id: null, name: "Driver" }] });
  legacy.feeds.start();
  assert.deepEqual(legacy.sockets.map((ws) => ws.url), ["ws://localhost:8100/ws/live"]);
  legacy.sockets[0].onopen();
  legacy.sockets[0].onmessage({ data: frame({ race_mode: false, is_race_on: 0 }) });
  assert.equal(legacy.feeds.status(null).kind, "receiving");
  assert.equal(legacy.detailFrames.length, 1);

  const doubled = rig({ drivers: [DRIVERS[0], DRIVERS[0], DRIVERS[1]], detail: "beta" });
  doubled.feeds.start();
  assert.equal(doubled.sockets.length, 2);
  assert.equal(doubled.feeds.detail(), "beta");           // the page asked for beta
  const unknown = rig({ detail: "nobody" });
  assert.equal(unknown.feeds.detail(), "alpha");           // unknown choice: first driver
});
