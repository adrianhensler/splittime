"use strict";
// apiFetch behind a login gate. Signed out (or without access), the hosted
// site answers a write with a redirect to its sign-in page; fetch follows it
// to a 200 HTML page. That must read as a refusal, not as saved.
const test = require("node:test"), assert = require("node:assert/strict");
const vm = require("node:vm"), fs = require("node:fs"), path = require("node:path");
const js = (name) => fs.readFileSync(path.join(__dirname, "../../app/static/js", name), "utf8");

// Anything common.js touches at load time: every lookup answers with a
// harmless callable stub, so only what the test asserts on is real.
function stub() {
  const fn = function () { return stub(); };
  return new Proxy(fn, {
    get: (target, key) => (key === Symbol.toPrimitive ? () => "" : key === "then" ? undefined : stub()),
    set: () => true,
  });
}

function loadCommon(response) {
  const alerts = [];
  const store = new Map();
  const context = vm.createContext({
    console, setTimeout, clearTimeout, Promise, JSON, URL, Map, Set, Error,
    document: stub(), navigator: stub(), location: stub(),
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
    },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener() {}, requestAnimationFrame: (fn) => setTimeout(fn, 0),
    fetch: async () => response,
  });
  context.window = context;
  vm.runInContext(js("common.js"), context, { filename: "common.js" });
  // the real uiAlert builds a modal; record what it would have said instead
  vm.runInContext("uiAlert = (title, message) => { __alerts.push({ title, message }); return Promise.resolve(); }",
    Object.assign(context, { __alerts: alerts }));
  return { context, alerts, apiFetch: (...args) => context.apiFetch(...args) };
}

const html = { json: async () => { throw new SyntaxError("Unexpected token '<'"); } };

test("a write the login gate redirects is reported as refused, not saved", async () => {
  const { apiFetch, alerts } = loadCommon({ ok: true, status: 200, redirected: true, ...html });
  await assert.rejects(
    apiFetch("api/sessions/1", { what: "rename the session", method: "PATCH" }),
    (err) => err.name === "ApiError" && /signed-in/.test(err.detail));
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].title, "Couldn't rename the session");
  assert.match(alerts[0].message, /Nothing was changed/);
});

test("an ordinary successful write still resolves to its JSON", async () => {
  const { apiFetch, alerts } = loadCommon(
    { ok: true, status: 200, redirected: false, json: async () => ({ id: 1, name: "Goliath" }) });
  assert.deepEqual(await apiFetch("api/sessions/1", { method: "PATCH" }), { id: 1, name: "Goliath" });
  assert.equal(alerts.length, 0);
});

test("a quiet poll that is redirected throws without a dialog", async () => {
  const { apiFetch, alerts } = loadCommon({ ok: true, status: 200, redirected: true, ...html });
  await assert.rejects(apiFetch("api/sessions", { quiet: true }));
  assert.equal(alerts.length, 0);
});
