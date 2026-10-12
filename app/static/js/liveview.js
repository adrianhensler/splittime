/* Live page glue (SplitTime): the driver strip and the choice of whose
   gauges to show.

   Reads the configured drivers from the API, opens one feed per driver
   (livefeeds.js) and gives each a card with their state, speed and lap times.
   Choosing a card shows that driver's frames in the gauges (dashboard.js).
   Names come from configuration and are only ever written as text. Two
   drivers can be on different routes at once, so the cards sit side by side
   and are never compared or ranked. */
(function () {
  "use strict";

  const cardsBox = document.getElementById("drivers");
  const note = document.getElementById("live-note");
  const cards = new Map();   // driver id -> {button, state, speed, laps}
  let feeds = null;

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function buildCard(driver) {
    const button = el("button", "driver-card");
    button.type = "button";
    const state = el("span", "driver-state");
    const speed = el("span", "driver-speed");
    const laps = el("span", "driver-laps");
    button.append(el("span", "driver-name", driver.name), state, speed, laps);
    button.addEventListener("click", () => choose(driver.id));
    cardsBox.appendChild(button);
    cards.set(driver.id, { button, state, speed, laps, name: driver.name });
  }

  function choose(id) {
    if (!feeds.selectDetail(id)) return;
    // keep the choice in the address so a reload or a shared link shows the
    // same driver; relative, so it works under a URL prefix
    if (id != null) {
      const url = new URL(location.href);
      url.searchParams.set("driver", id);
      history.replaceState(null, "", url.pathname + url.search);
    }
    refresh();
  }

  function lapText(s, racing) {
    if (!s) return "";
    const parts = [];
    if (racing) parts.push(`Lap ${(s.lap_number || 0) + 1} · ${fmtLap(s.current_lap)}`);
    if (s.last_lap > 0) parts.push(`last ${fmtLap(s.last_lap)}`);
    if (s.best_lap > 0) parts.push(`best ${fmtLap(s.best_lap)}`);
    return parts.join(" · ");
  }

  function refresh() {
    if (!feeds) return;
    const detail = feeds.detail();
    for (const [id, card] of cards) {
      const st = feeds.status(id);
      const s = feeds.summary(id);
      const chosen = id === detail;
      card.button.setAttribute("aria-pressed", chosen ? "true" : "false");
      card.button.classList.toggle("chosen", chosen);
      card.state.textContent = st.label;
      card.state.className = `driver-state ${st.cls}`;
      // a number only while it is current: a paused driver's last speed is
      // not their speed now
      card.speed.textContent = st.fresh && s
        ? `${Math.round(Math.max(0, speedFromMps(s.speed)))} ${speedUnit()}` : "—";
      card.laps.textContent = lapText(s, st.kind === "racing");
      card.button.setAttribute("aria-label",
        `${card.name}: ${st.label}${chosen ? ", shown below" : ", show in detail"}`);
    }
    const st = feeds.status(detail);
    if (!st) return;
    setDetailStatus(st.label, st.cls);
    note.textContent = st.sentence;
    note.hidden = !st.sentence;
  }

  async function configuredDrivers() {
    try {
      const response = await fetch("api/drivers");
      if (!response.ok) return [];
      const list = await response.json();
      return (Array.isArray(list) ? list : [])
        .filter((d) => d && typeof d.id === "string" && d.id)
        .map((d) => ({ id: d.id, name: String(d.name || d.id) }));
    } catch {
      return [];
    }
  }

  async function init() {
    let drivers = await configuredDrivers();
    // an install with no driver list still has the one legacy feed
    if (!drivers.length) drivers = [{ id: null, name: "Driver" }];
    drivers.forEach(buildCard);
    cardsBox.classList.toggle("single", drivers.length === 1);

    feeds = LiveFeeds.createLiveFeeds({
      drivers,
      detail: new URLSearchParams(location.search).get("driver"),
      location,
      makeSocket: (url) => new WebSocket(url),
      now: () => performance.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (handle) => clearTimeout(handle),
      isHidden: () => document.hidden,
      onDetailFrame: detailFrame,
      onDetailReset: resetDetail,
      onChange: refresh,
    });
    feeds.start();
    refresh();
    // states such as "paused" are a matter of elapsed time, not of an event
    setVisibleInterval(refresh, 250);
    onSettingsChange(refresh);  // speed unit
    window.addEventListener("pagehide", () => feeds.stop());
  }

  init();
})();
