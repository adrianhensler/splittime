"use strict";
/* Offers a refresh when results change after the page loaded (ADR 36). It asks
   api/changes about once a minute, only while the tab is visible, and again on
   coming back to the tab. Nothing reloads by itself: the bar says so and waits. */
(function () {
  const PERIOD = 60000, RETURN = 15000;

  // fetchToken resolves to a token or null (unknown: try again next time)
  function watch({fetchToken, visible, now, onChange}) {
    let base = null, missed = false, waiting = false, busy = false, last = -Infinity;
    async function check(force = false) {
      // the first token is what the page loaded with, so it is read even in a background tab
      if (waiting || busy || (base !== null && !visible()) || (!force && now() - last < RETURN)) return;
      busy = true; last = now();
      try {
        const token = await fetchToken();
        if (token === null) {if (base === null) missed = true; return;}
        if (base === null) {
          base = token;
          // the page loaded without a token, so this one may already be newer
          // than what it shows: offer a refresh rather than assume (Codex, #58)
          if (missed) {waiting = true; onChange(token, true);}
        } else if (token !== base) {waiting = true; onChange(token, false);}
      } finally {busy = false;}
    }
    // "Later": count from what is showing now, and keep watching
    const later = token => {base = token; waiting = false;};
    return {check, later};
  }

  globalThis.Updates = {watch, PERIOD};
  if (typeof document === "undefined") return;

  const STYLE = "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:1000;" +
    "max-width:calc(100% - 32px);box-sizing:border-box;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;" +
    "padding:10px 14px;border-radius:8px;background:#132131;color:#eaf2f7;border:1px solid #344b60;" +
    "box-shadow:0 6px 20px rgba(0,0,0,.35);font:14px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif";
  const BUTTON = "font:inherit;border-radius:5px;padding:5px 12px;cursor:pointer;";
  let bar = null;
  function show(token, unsure) {
    bar?.remove();
    bar = document.createElement("div");
    bar.setAttribute("role", "status");
    bar.style.cssText = STYLE;
    bar.innerHTML = `<span>Results ${unsure ? "may have" : "have"} changed since this page loaded.</span>` +
      `<button type="button" data-act="refresh" style="${BUTTON}background:#6ce0cb;color:#0a1420;border:0">Refresh</button>` +
      `<button type="button" data-act="later" style="${BUTTON}background:transparent;color:#eaf2f7;border:1px solid #344b60">Later</button>`;
    bar.addEventListener("click", event => {
      const act = event.target.closest("[data-act]")?.dataset.act;
      if (act === "refresh") location.reload();
      if (act === "later") {bar.remove(); bar = null; watcher.later(token);}
    });
    document.body.append(bar);
  }
  const watcher = watch({
    fetchToken: async () => {
      try {
        const response = await fetch("api/changes", {cache: "no-store"});
        return response.ok ? (await response.json()).token ?? null : null;
      } catch {return null;}
    },
    visible: () => document.visibilityState === "visible",
    now: () => Date.now(),
    onChange: show,
  });
  watcher.check(true);
  setInterval(() => watcher.check(true), PERIOD);
  document.addEventListener("visibilitychange", () => watcher.check());
})();
