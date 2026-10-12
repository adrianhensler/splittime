"use strict";
// The Live page as a whole, in a fake DOM: livefeeds.js + dashboard.js +
// liveview.js loaded the way index.html loads them. Checks what a viewer
// sees when two drivers are live and the shown driver is switched.
const test = require("node:test"), assert = require("node:assert/strict");
const vm = require("node:vm"), fs = require("node:fs"), path = require("node:path");
const js = (name) => fs.readFileSync(path.join(__dirname, "../../app/static/js", name), "utf8");

const HOSTILE = '<img src=x onerror="document.title=1">';

function fakeElement(tag) {
  const handlers = {}, found = {}, attrs = {}, classes = new Set();
  const element = {
    tag, textContent: "", innerHTML: "", hidden: false, style: {}, children: [], title: "",
    parentElement: { clientWidth: 800 },
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle(c, on) { (on === undefined ? !classes.has(c) : on) ? classes.add(c) : classes.delete(c); },
    },
    append(...nodes) { element.children.push(...nodes); },
    appendChild(node) { element.children.push(node); return node; },
    prepend(node) { element.children.unshift(node); },
    remove() {},
    addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
    dispatch(type) { (handlers[type] || []).forEach((fn) => fn({ type })); },
    click() { element.dispatch("click"); },
    setAttribute(name, value) { attrs[name] = String(value); },
    getAttribute: (name) => attrs[name],
    querySelector(selector) { return (found[selector] ||= fakeElement(selector)); },
    querySelectorAll: () => [],
    insertRow: () => fakeElement("tr"),
    insertCell: () => fakeElement("td"),
  };
  Object.defineProperty(element, "className", {
    get: () => [...classes].join(" "),
    set(value) { classes.clear(); String(value).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); },
  });
  return element;
}

function allText(element, out = []) {
  out.push(element.textContent, element.innerHTML, element.title, element.getAttribute("aria-label") || "");
  element.children.forEach((child) => allText(child, out));
  return out;
}

function liveFrame(over) {
  return {
    is_race_on: 1, race_mode: true, session_id: 7, _t: 1,
    current_engine_rpm: 5000, engine_max_rpm: 8000, engine_idle_rpm: 800, gear: 3,
    accel_x: 1, accel_z: 2, speed: 50, power: 100000, boost: 3,
    accel: 255, brake: 0, steer: 10, yaw: 0, pos_x: 10, pos_z: 20,
    tire_combined_slip: [0.3, 0.3, 0.3, 0.3], tire_temp: [180, 180, 180, 180],
    norm_susp_travel: [0.5, 0.5, 0.5, 0.5], tire_slip_angle: [0, 0, 0, 0],
    car_ordinal: 100, car_class: 3, car_pi: 800, drivetrain_type: 1,
    current_lap: 12.5, lap_elapsed: 12.5, last_lap: 91.25, best_lap: 90.5, session_best: 90.5,
    lap_number: 1, race_position: 1, delta: -0.25, current_race_time: 100,
    ...over,
  };
}

// `drivers`: an array (the server's answer), or a function called once per
// request for api/drivers that returns a fetch-like response or a promise.
async function page({ drivers, href = "https://test.example/splittime/index.html" } = {}) {
  const byId = {}, env = { now: 1000, sockets: [], frames: [], intervals: [], carLookups: [],
    replaced: [], timeouts: [], listRequests: 0 };
  const windowHandlers = {}, documentHandlers = {};
  const document = {
    hidden: false, body: fakeElement("body"),
    getElementById: (id) => (byId[id] ||= fakeElement("#" + id)),
    createElement: (tag) => fakeElement(tag),
    querySelectorAll: () => [],
    addEventListener(type, fn) { (documentHandlers[type] ||= []).push(fn); },
  };
  const url = new URL(href);
  const context = vm.createContext({
    document, URL, URLSearchParams, JSON, Math, Promise, console,
    location: { protocol: url.protocol, host: url.host, href, search: url.search },
    history: { replaceState: (_s, _t, to) => env.replaced.push(to) },
    performance: { now: () => env.now },
    requestAnimationFrame: (fn) => { env.frames.push(fn); },
    setTimeout(fn, ms) { const timer = { fn, ms, cleared: false }; env.timeouts.push(timer); return timer; },
    clearTimeout(timer) { if (timer) timer.cleared = true; },
    setInterval: () => 1,
    addEventListener(type, fn) { (windowHandlers[type] ||= []).push(fn); },
    WebSocket: function (socketUrl) { this.url = socketUrl; this.close = () => { this.closed = true; }; env.sockets.push(this); },
    fetch(resource) {
      if (resource === "api/drivers") {
        env.listRequests++;
        if (typeof drivers === "function") return Promise.resolve(drivers(env.listRequests));
        return Promise.resolve({ ok: true, json: async () => drivers });
      }
      if (resource === "api/status") return Promise.resolve({ json: async () => ({ drivers: [] }) });
      return new Promise((resolve) => env.carLookups.push({
        resource, answer: (name) => resolve({ json: async () => ({ name, known: true }) }) }));
    },
    // what common.js, settings.js and gauges.js provide on the real page
    initCanvas: () => ({}), rafThrottle: (fn) => fn, refreshCanvasTheme() {},
    getSettings: () => ({ freeroamMap: false, rawLive: false }), onSettingsChange() {},
    setVisibleInterval: (fn) => { env.intervals.push(fn); },
    RAW_FIELDS: [], fmtRaw: String, CLASS_LETTERS: ["D", "C", "B", "A"], DRIVETRAINS: ["FWD", "RWD", "AWD"],
    classBadge: () => "", dtBadge: () => "",
    drawRpm() {}, drawFriction() {}, drawGrip() {}, drawStrip() {}, drawLiveMap() {},
    speedFromMps: (v) => v * 3.6, speedUnit: () => "km/h", powerFromW: (w) => w / 1000,
    powerUnit: () => "kW", fmtBoost: (v) => v.toFixed(1), boostUnit: () => "psi",
    fmtTireTemp: (t) => `${t}°`,
  });
  context.window = context;
  for (const name of ["livefeeds.js", "dashboard.js", "liveview.js"])
    vm.runInContext(js(name), context, { filename: name });
  for (let i = 0; i < 10; i++) await null;       // let liveview's async init finish

  env.$ = document.getElementById;
  env.eval = (code) => vm.runInContext(code, context);
  env.cards = () => env.$("drivers").children;
  env.socket = (id) => env.sockets.find((ws) => ws.url.endsWith("driver=" + id));
  env.send = (id, over) => env.socket(id).onmessage({ data: JSON.stringify(liveFrame(over)) });
  env.paint = () => { const fn = env.frames.pop(); env.frames.length = 0; fn(); };
  env.refresh = () => env.intervals.forEach((fn) => fn());
  env.leave = () => (windowHandlers.pagehide || []).forEach((fn) => fn({ type: "pagehide", persisted: true }));
  env.comeBack = (persisted = true) =>
    (windowHandlers.pageshow || []).forEach((fn) => fn({ type: "pageshow", persisted }));
  env.hide = () => { document.hidden = true; (documentHandlers.visibilitychange || []).forEach((fn) => fn()); };
  env.show = () => { document.hidden = false; (documentHandlers.visibilitychange || []).forEach((fn) => fn()); };
  env.runTimeouts = () => {
    const due = env.timeouts.filter((timer) => !timer.cleared && !timer.ran);
    due.forEach((timer) => { timer.ran = true; timer.fn(); });
    return due.map((timer) => timer.ms);
  };
  env.settle = async () => { for (let i = 0; i < 10; i++) await null; };
  env.text = () => allText(env.$("drivers")).concat(allText(env.$("live-note")),
    allText(env.$("conn")), allText(env.$("car-chip")), allText(document.body)).join("\n");
  return env;
}

const TWO = [{ id: "alpha", name: "Driver Alpha", udp_port: 9999 },
             { id: "beta", name: HOSTILE, udp_port: 10000 }];

test("one card per configured driver, names as text, sockets under the page's prefix", async () => {
  const env = await page({ drivers: TWO });
  const [alpha, beta] = env.cards();
  assert.equal(env.cards().length, 2);
  assert.equal(alpha.children[0].textContent, "Driver Alpha");
  assert.equal(beta.children[0].textContent, HOSTILE);       // shown as text...
  assert.equal(beta.children[0].innerHTML, "");               // ...never as markup
  assert.equal(beta.innerHTML, "");
  assert.deepEqual(env.sockets.map((ws) => ws.url), [
    "wss://test.example/splittime/ws/live?driver=alpha",
    "wss://test.example/splittime/ws/live?driver=beta"]);
  assert.equal(alpha.getAttribute("aria-pressed"), "true");
  assert.equal(beta.getAttribute("aria-pressed"), "false");
  assert.equal(alpha.tag, "button");
});

test("before any telemetry the page says waiting, not live or paused, and shows no address or port", async () => {
  const env = await page({ drivers: TWO });
  env.sockets.forEach((ws) => ws.onopen());
  env.refresh();
  assert.equal(env.$("conn").querySelector("span").textContent, "waiting");
  assert.match(env.$("live-note").textContent, /^Waiting for Driver Alpha telemetry/);
  assert.equal(env.$("live-note").hidden, false);
  assert.equal(env.cards()[0].children[2].textContent, "—");  // no speed yet
  // the API hands the page each driver's port; none of it may be displayed
  assert.doesNotMatch(env.text(), /9999|10000|127\.0\.0\.1|\bUDP\b|\bport\b|Data Out IP/i);
});

test("two drivers live at once: both cards update, gauges show only the chosen driver", async () => {
  const env = await page({ drivers: TWO });
  env.sockets.forEach((ws) => ws.onopen());
  env.send("alpha", { speed: 50, race_mode: true });
  env.send("beta", { speed: 20, race_mode: false });
  env.refresh(); env.paint();
  const [alpha, beta] = env.cards();
  assert.equal(alpha.children[1].textContent, "racing");
  assert.equal(alpha.children[2].textContent, "180 km/h");
  assert.match(alpha.children[3].textContent, /^Lap 2 · 0:12\.500 · last 1:31\.250 · best 1:30\.500$/);
  assert.equal(beta.children[1].textContent, "free roam");
  assert.equal(beta.children[2].textContent, "72 km/h");
  assert.equal(env.$("speed").textContent, 180);              // alpha's, in the gauges
  assert.equal(env.$("conn").querySelector("span").textContent, "racing");
  assert.equal(env.$("live-note").hidden, true);
});

test("switching drivers clears every trace of the previous one, including a late car name", async () => {
  const env = await page({ drivers: TWO });
  env.sockets.forEach((ws) => ws.onopen());
  for (let i = 0; i < 5; i++) env.send("alpha", { car_ordinal: 100, pos_x: 10 + i * 5 });
  env.paint();
  assert.equal(env.eval("state.trail.length"), 5);
  assert.equal(env.eval("liveMap.pts.length"), 5);
  assert.equal(env.carLookups.length, 1);                      // alpha's car name, still in flight
  env.eval("rawPanel.held = true");

  env.cards()[1].click();                                      // show beta, who has sent nothing
  assert.equal(env.eval("state.frame"), null);
  assert.equal(env.eval("state.trail.length + state.strip.length + liveMap.pts.length + liveMap.hits.length"), 0);
  assert.equal(env.eval("liveMap.session"), null);
  assert.equal(env.eval("rawPanel.held"), false);
  assert.equal(env.$("car-chip").style.display, "none");
  env.paint();
  assert.equal(env.$("speed").textContent, 0);
  assert.equal(env.$("gear-mini").textContent, "–");
  assert.equal(env.$("lap-last").textContent, "–:--.---");
  assert.equal(env.$("race-flag").textContent, "—");
  assert.equal(env.$("delta").textContent, "—");
  assert.equal(env.cards()[1].getAttribute("aria-pressed"), "true");
  assert.equal(env.cards()[0].getAttribute("aria-pressed"), "false");
  assert.deepEqual(env.replaced, ["/splittime/index.html?driver=beta"]);
  assert.match(env.$("live-note").textContent, /^Waiting for /);

  // alpha's car name arrives after the switch: it must not appear under beta
  env.carLookups[0].answer("Alpha's Porsche");
  await env.settle();
  assert.equal(env.$("car-chip").style.display, "none");
  assert.equal(env.$("car-chip").querySelector(".car-nm").textContent, "");

  // alpha keeps driving in the background; beta's gauges stay empty
  env.send("alpha", { speed: 99 });
  env.paint();
  assert.equal(env.eval("state.frame"), null);
  assert.equal(env.$("speed").textContent, 0);

  // beta starts: their own car and numbers, nothing of alpha's
  env.send("beta", { car_ordinal: 200, speed: 10 });
  env.paint();
  env.carLookups.at(-1).answer("Beta's Jimmy");
  await env.settle();
  assert.equal(env.carLookups.at(-1).resource, "api/cars/200");
  assert.equal(env.$("car-chip").querySelector(".car-nm").textContent, "Beta's Jimmy");
  assert.equal(env.$("speed").textContent, 36);
  assert.equal(env.eval("state.trail.length"), 1);
  assert.equal(env.sockets.length, 2);                          // the switch opened nothing new
});

test("driver card accessible names include telemetry and stop announcing a paused speed", async () => {
  const env = await page({ drivers: TWO });
  env.sockets.forEach((ws) => ws.onopen());
  env.send("alpha", { speed: 50, race_mode: true });
  env.refresh();
  const alpha = env.cards()[0];
  const racing = alpha.getAttribute("aria-label");
  assert.match(racing, /^Driver Alpha, racing, speed 180 km\/h,/);
  assert.ok(racing.includes(alpha.children[3].textContent));
  assert.match(racing, /shown below$/);
  env.now += 10000;
  env.refresh();
  assert.match(alpha.getAttribute("aria-label"), /Driver Alpha, paused,/);
  assert.doesNotMatch(alpha.getAttribute("aria-label"), /speed|180 km\/h/);
  env.cards()[1].click();
  assert.match(alpha.getAttribute("aria-label"), /show in detail$/);
});

test("a paused driver keeps their card but loses the speed, and the other is unaffected", async () => {
  const env = await page({ drivers: TWO });
  env.sockets.forEach((ws) => ws.onopen());
  env.send("alpha"); env.send("beta", { speed: 20 });
  env.now += 3000;
  env.send("beta", { speed: 21 });
  env.refresh();
  const [alpha, beta] = env.cards();
  assert.equal(alpha.children[1].textContent, "paused");
  assert.equal(alpha.children[2].textContent, "—");
  assert.match(env.$("live-note").textContent, /^Driver Alpha's telemetry is paused/);
  assert.equal(beta.children[1].textContent, "racing");
  assert.equal(beta.children[2].textContent, "76 km/h");
});

const failed = () => ({ ok: false, json: async () => ({ detail: "server error" }) });
const answered = (list) => ({ ok: true, json: async () => list });

test("a failed driver list is shown and retried, never mistaken for a single-driver install", async () => {
  const outcomes = [
    () => Promise.reject(new TypeError("network")),          // request failed
    failed,                                                   // HTTP 500
    () => answered({ drivers: "not a list" }),                // an answer, but not a list
    () => answered(TWO),
  ];
  const env = await page({ drivers: (n) => outcomes[n - 1]() });
  assert.equal(env.cards().length, 0);                        // no generic "Driver" card
  assert.equal(env.sockets.length, 0);                        // and no first-driver socket
  assert.match(env.$("live-note").textContent, /^Could not load the list of drivers/);
  assert.equal(env.$("live-note").hidden, false);
  assert.equal(env.$("conn").querySelector("span").textContent, "no driver list");

  const delays = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    delays.push(...env.runTimeouts());
    await env.settle();
  }
  assert.deepEqual(delays, [2000, 4000, 8000]);               // bounded backoff
  assert.equal(env.listRequests, 4);

  // recovered: both configured drivers, each with their own socket
  assert.equal(env.cards().length, 2);
  assert.equal(env.cards()[0].children[0].textContent, "Driver Alpha");
  assert.deepEqual(env.sockets.map((ws) => ws.url), [
    "wss://test.example/splittime/ws/live?driver=alpha",
    "wss://test.example/splittime/ws/live?driver=beta"]);
  assert.doesNotMatch(env.$("live-note").textContent, /Could not load/);
  assert.equal(env.runTimeouts().length, 0);                  // nothing left retrying
  assert.doesNotMatch(env.text(), /9999|10000|127\.0\.0\.1|\bUDP\b/);
});

test("leaving while the first driver list is still loading opens nothing afterwards", async () => {
  let release;
  const first = new Promise((resolve) => { release = resolve; });
  const env = await page({ drivers: (n) => (n === 1 ? first : answered(TWO)) });
  assert.equal(env.sockets.length, 0);
  env.leave();                                                // gone before the answer
  release(answered(TWO));
  await env.settle();
  assert.equal(env.sockets.length, 0);                        // the late answer is ignored
  assert.equal(env.cards().length, 0);

  env.comeBack();                                             // restored: ask again, once
  await env.settle();
  assert.equal(env.listRequests, 2);
  assert.equal(env.cards().length, 2);
  assert.equal(env.sockets.length, 2);
});

test("leaving while a retry is pending cancels it", async () => {
  const env = await page({ drivers: failed });
  assert.equal(env.timeouts.filter((timer) => !timer.cleared).length, 1);
  env.leave();
  assert.ok(env.timeouts.every((timer) => timer.cleared));
  env.timeouts.forEach((timer) => timer.fn());                // even if one fired anyway
  await env.settle();
  assert.equal(env.sockets.length, 0);
});

test("a page restored from the back/forward cache reconnects every driver once", async () => {
  const env = await page({ drivers: TWO });
  env.sockets.forEach((ws) => ws.onopen());
  env.send("alpha", { speed: 50 });
  env.paint();
  assert.equal(env.$("speed").textContent, 180);
  env.comeBack(false);                                        // the ordinary first pageshow
  assert.equal(env.sockets.length, 2);

  const old = env.sockets.slice();
  env.leave();
  assert.ok(old.every((ws) => ws.closed && ws.onmessage === null));
  env.now += 60000;

  env.comeBack();
  assert.equal(env.sockets.length, 4);                        // one new socket per driver
  assert.deepEqual(env.sockets.slice(2).map((ws) => ws.url), old.map((ws) => ws.url));
  assert.equal(env.cards().length, 2);                        // cards are not built twice
  assert.equal(env.listRequests, 1);
  env.paint();
  assert.equal(env.$("speed").textContent, 0);                // a minute-old frame is not shown
  assert.equal(env.cards()[0].children[2].textContent, "—");
  env.comeBack();                                             // a second pageshow changes nothing
  assert.equal(env.sockets.length, 4);

  const fresh = env.sockets.slice(2);
  fresh.forEach((ws) => ws.onopen());
  fresh[0].onmessage({ data: JSON.stringify(liveFrame({ speed: 10 })) });
  fresh[1].onmessage({ data: JSON.stringify(liveFrame({ speed: 20 })) });
  env.refresh(); env.paint();
  assert.equal(env.$("speed").textContent, 36);
  assert.equal(env.cards()[1].children[2].textContent, "72 km/h");
});

test("returning to a hidden tab never shows the frame from before it was hidden as current", async () => {
  const env = await page({ drivers: TWO });
  env.sockets.forEach((ws) => ws.onopen());
  env.send("alpha", { speed: 40, race_mode: true });
  env.paint();
  assert.equal(env.$("speed").textContent, 144);

  env.hide();
  env.now += 10000;
  env.send("alpha", { speed: 95, race_mode: false });         // arrives while hidden
  env.now += 1;
  env.show();                                                 // back before any further packet
  env.paint();
  assert.equal(env.$("speed").textContent, 342);              // 95 m/s, not the old 144
  assert.equal(env.$("race-flag").textContent, "FREE ROAM");
  assert.equal(env.cards()[0].children[1].textContent, "free roam");
  assert.equal(env.cards()[0].children[2].textContent, "342 km/h");
  assert.equal(env.eval("state.trail.length"), 1);            // history restarted, not ten seconds stale

  // the same, but the hidden packet could not be read: nothing current to show
  env.hide();
  env.now += 10000;
  env.socket("alpha").onmessage({ data: "{truncated" });
  env.now += 1;
  env.show();
  env.paint();
  assert.equal(env.$("speed").textContent, 0);
  assert.equal(env.$("race-flag").textContent, "—");
  assert.equal(env.cards()[0].children[1].textContent, "receiving");
  assert.equal(env.cards()[0].children[2].textContent, "—");
});

test("a configured single driver, or a server with an empty driver list, gets one usable feed", async () => {
  const one = await page({ drivers: [{ id: "solo", name: "Solo", udp_port: 9999 }], href: "http://localhost:8100/" });
  assert.equal(one.cards().length, 1);
  assert.deepEqual(one.sockets.map((ws) => ws.url), ["ws://localhost:8100/ws/live?driver=solo"]);

  // the server answered, and its answer was "no list": the one legacy feed
  const none = await page({ drivers: [], href: "http://localhost:8100/index.html" });
  assert.equal(none.cards().length, 1);
  assert.deepEqual(none.sockets.map((ws) => ws.url), ["ws://localhost:8100/ws/live"]);
  none.sockets[0].onopen();
  none.sockets[0].onmessage({ data: JSON.stringify(liveFrame({ speed: 10 })) });
  none.paint();
  assert.equal(none.$("speed").textContent, 36);
});

test("the address can ask for a driver, and leaving the page closes every socket", async () => {
  const env = await page({ drivers: TWO, href: "https://test.example/splittime/index.html?driver=beta" });
  assert.equal(env.cards()[1].getAttribute("aria-pressed"), "true");
  env.sockets.forEach((ws) => ws.onopen());
  env.leave();
  assert.ok(env.sockets.every((ws) => ws.closed));
});
