/* Live feeds: one driver-scoped WebSocket per configured driver (SplitTime).

   Each driver has their own listener, tracker and hub on the server, and
   `ws/live?driver=<id>` subscribes to one of them. This file owns those
   sockets for the Live page: all drivers are subscribed at once, each feed
   reconnects on its own, and exactly one driver at a time is the "detail"
   driver whose full frames drive the gauges.

   No DOM in here. Everything the browser provides (sockets, timers, the
   clock, tab visibility) is passed in, so the behaviour is tested in Node
   (tests/ui/livefeeds.test.cjs). liveview.js is the page glue. */
(function (root) {
  "use strict";

  /* Reconnect backoff: doubles up to the maximum, resets on a successful
     open (upstream issue #73). */
  const RECONNECT_MIN = 1500;
  const RECONNECT_MAX = 15000;
  // no packet for this long = the game stopped sending (menus, pause, focus)
  const STALE_MS = 2500;
  // drivers who are not the detail driver only need a summary: parse a frame
  // this often instead of at the game's 60-140 per second
  const SUMMARY_MS = 200;

  /* Same-origin socket URL, relative to the page so the app works under a
     URL prefix (ADR 16), and wss when the page is served over TLS. A null
     driver gives the legacy no-query URL (the server's first driver). */
  function liveSocketUrl(loc, driverId) {
    const scheme = loc.protocol === "https:" ? "wss:" : "ws:";
    const path = new URL("ws/live", loc.href).pathname;
    const query = driverId == null ? "" : "?driver=" + encodeURIComponent(driverId);
    return scheme + "//" + loc.host + path + query;
  }

  const LABELS = {
    connecting: "connecting…",
    reconnecting: "reconnecting…",
    waiting: "waiting",
    paused: "paused",
    racing: "racing",
    "free-roam": "free roam",
    receiving: "receiving",
  };
  // chip classes from style.css
  const CLASSES = {
    connecting: "", reconnecting: "err", waiting: "warn", paused: "warn",
    racing: "ok", "free-roam": "ok", receiving: "ok",
  };

  /* A sentence for spectators. Never an address or a port: viewers do not
     configure anything, and each driver's setup is their own business. */
  function describe(kind, name) {
    switch (kind) {
      case "connecting": return "Connecting to " + name + "'s feed…";
      case "reconnecting": return "Lost the connection to " + name + "'s feed. Reconnecting…";
      case "waiting": return "Waiting for " + name + " telemetry. The game sends nothing in menus or while paused.";
      case "paused": return name + "'s telemetry is paused. The game sends nothing in menus or while paused.";
      default: return "";
    }
  }

  function summaryOf(f) {
    return {
      speed: f.speed,
      is_race_on: !!f.is_race_on,
      race_mode: !!f.race_mode,
      current_lap: f.current_lap || f.lap_elapsed || 0,
      last_lap: f.last_lap || 0,
      best_lap: f.session_best != null ? f.session_best : (f.best_lap || 0),
      lap_number: f.lap_number,
      race_position: f.race_position,
    };
  }

  /* options:
       drivers        [{id, name}], id null for a legacy single feed
       detail         id of the driver to show in detail first (default: first)
       location       {protocol, host, href}
       makeSocket     (url) => WebSocket-like
       now            () => ms, monotonic
       setTimer, clearTimer
       isHidden       () => true while the tab is hidden
       onDetailFrame  (frame, driverId) full frames of the detail driver only
       onDetailReset  (driverId) the detail driver changed: drop everything shown
       onChange       (driverId) a feed's connection state changed */
  function createLiveFeeds(options) {
    const now = options.now;
    const parse = options.parse || JSON.parse;
    const isHidden = options.isHidden || (() => false);
    const noop = () => {};
    const onDetailFrame = options.onDetailFrame || noop;
    const onDetailReset = options.onDetailReset || noop;
    const onChange = options.onChange || noop;

    const feeds = new Map();
    for (const d of options.drivers) {
      if (feeds.has(d.id)) continue;  // one subscription per driver, whatever the list says
      feeds.set(d.id, {
        id: d.id, name: d.name, socket: null, timer: null,
        connected: false, everConnected: false,
        lastArrival: null, lastParsed: -Infinity,
        frame: null, summary: null, delay: RECONNECT_MIN,
      });
    }
    let detailId = feeds.has(options.detail) ? options.detail
      : (feeds.size ? feeds.keys().next().value : undefined);
    let started = false;
    let stopped = false;

    function open(feed) {
      if (stopped || feed.socket) return;
      const ws = options.makeSocket(liveSocketUrl(options.location, feed.id));
      feed.socket = ws;
      // every handler checks it still belongs to the feed's current socket: a
      // callback from a socket that was replaced or shut down must do nothing
      const current = () => !stopped && feed.socket === ws;
      ws.onopen = () => {
        if (!current()) return;
        feed.connected = true;
        feed.everConnected = true;
        feed.delay = RECONNECT_MIN;
        onChange(feed.id);
      };
      ws.onmessage = (ev) => {
        if (!current()) return;
        const t = now();
        // Recorded for every packet, parsed or not, so "paused" always means
        // the game stopped sending - never that this tab stopped looking.
        feed.lastArrival = t;
        // A hidden tab draws nothing: skip the parse, keep the socket.
        if (isHidden()) return;
        const detail = feed.id === detailId;
        if (!detail && t - feed.lastParsed < SUMMARY_MS) return;
        let f;
        try { f = parse(ev.data); } catch (e) { return; }
        if (!f || typeof f !== "object") return;
        feed.lastParsed = t;
        feed.frame = f;
        feed.summary = summaryOf(f);
        if (detail) onDetailFrame(f, feed.id);
      };
      ws.onclose = () => {
        if (!current()) return;
        feed.socket = null;
        feed.connected = false;
        feed.timer = options.setTimer(() => { feed.timer = null; open(feed); }, feed.delay);
        feed.delay = Math.min(RECONNECT_MAX, feed.delay * 2);
        onChange(feed.id);
      };
      ws.onerror = () => {
        if (!current()) return;
        try { ws.close(); } catch (e) { /* already closing */ }
      };
    }

    function start() {
      if (started || stopped) return;
      started = true;
      if (detailId !== undefined) onDetailReset(detailId);
      for (const feed of feeds.values()) open(feed);
    }

    /* Page exit: no reconnects, no late callbacks, sockets closed. */
    function stop() {
      if (stopped) return;
      stopped = true;
      for (const feed of feeds.values()) {
        if (feed.timer != null) { options.clearTimer(feed.timer); feed.timer = null; }
        const ws = feed.socket;
        feed.socket = null;
        feed.connected = false;
        if (ws) {
          ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
          try { ws.close(); } catch (e) { /* never opened */ }
        }
      }
    }

    function kindOf(feed, t) {
      if (!feed.connected) return feed.everConnected ? "reconnecting" : "connecting";
      if (feed.lastArrival == null) return "waiting";
      if (t - feed.lastArrival > STALE_MS) return "paused";
      if (feed.summary && feed.summary.race_mode) return "racing";
      if (feed.summary && feed.summary.is_race_on) return "free-roam";
      return "receiving";
    }

    function status(id, t) {
      const feed = feeds.get(id);
      if (!feed) return null;
      const kind = kindOf(feed, t == null ? now() : t);
      return {
        kind, label: LABELS[kind], cls: CLASSES[kind],
        fresh: kind === "racing" || kind === "free-roam" || kind === "receiving",
        sentence: describe(kind, feed.name),
      };
    }

    /* Show another driver in detail. Sockets are untouched - every driver is
       already subscribed - so switching never drops or duplicates a feed. */
    function selectDetail(id) {
      if (stopped || !feeds.has(id) || id === detailId) return false;
      detailId = id;
      onDetailReset(id);
      const feed = feeds.get(id);
      // their own most recent frame, if it is current, so the gauges do not
      // sit empty until the next packet; a paused driver starts blank
      if (feed.frame && status(id).fresh && !isHidden()) onDetailFrame(feed.frame, id);
      onChange(id);
      return true;
    }

    return {
      start, stop, status, selectDetail,
      detail: () => detailId,
      summary: (id) => (feeds.has(id) ? feeds.get(id).summary : null),
      drivers: () => Array.from(feeds.values(), (f) => ({ id: f.id, name: f.name })),
    };
  }

  const api = {
    liveSocketUrl, createLiveFeeds, describe,
    RECONNECT_MIN, RECONNECT_MAX, STALE_MS, SUMMARY_MS,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LiveFeeds = api;
})(typeof window !== "undefined" ? window : globalThis);
