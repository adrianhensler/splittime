/* One strip for a chosen pair of laps, the same on every page that shows that
   pair: who and where, then the pair's three views, each a link carrying the
   same two laps. Pages that show a pair put <div data-pair-bar="view"> in
   their HTML; Rivalry renders it itself from the data it already has. */
"use strict";
(function (root) {
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char =>
    ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[char]));
  const EST = "The game stopped sending data at the finish line, so this time is SplitTime’s last clock reading.";
  const VIEWS = [["report", "Race report"], ["traces", "Traces & corners"], ["replay", "Replay"]];
  const id = value => /^[1-9]\d*$/.test(value ?? "") && Number.isSafeInteger(Number(value)) ? Number(value) : null;

  /* Two lap IDs from ?laps=a,b (or the older ?lap_a=&lap_b=), or null. */
  function parse(search) {
    const params = new URLSearchParams(search), laps = params.get("laps");
    const [a, b] = laps !== null ? laps.split(",").map(id) : [id(params.get("lap_a")), id(params.get("lap_b"))];
    return laps !== null && laps.split(",").length !== 2 || !a || !b || a === b ? null : [a, b];
  }
  function href(view, a, b) {
    const query = `laps=${a},${b}`;
    return view === "report" ? `rivalry-v2.html?${query}#st-analysis` :
      view === "traces" ? `compare.html?${query}` : `replay.html?${query}`;
  }
  function find(categories, lapId) {
    for (const group of categories || []) for (const lap of group.attempts || [])
      if (lap.lap_id === lapId) return {group, lap};
    return null;
  }
  /* `inPage`: Rivalry itself, where the report is the current view and the
     pair is changed with the A/B pickers rather than by reloading. */
  function html(categories, a, b, current, {inPage = false} = {}) {
    const M = root.RivalryModel, found = [find(categories, a), find(categories, b)];
    const who = (side, lapId, hit) => hit ? `<strong>${esc(hit.lap.driver_name)}</strong> <span class="st-time">${
      M ? M.time(hit.lap.time_s) : esc(hit.lap.time_s)}</span>${hit.lap.finish === "last_packet" ?
      ` <abbr class="st-est" title="${EST}">est.</abbr>` : ""} <span class="st-quiet">(${side})</span>` :
      `Lap ${lapId} <span class="st-quiet">(${side})</span>`;
    const group = found[0]?.group || found[1]?.group;
    return `<div class="st-pair-who">${group ? `<span class="st-quiet">${esc(group.route_name)} · ${esc(group.car_class_label)}</span> ` : ""}
      ${who("A", a, found[0])} vs ${who("B", b, found[1])}${inPage ? "" :
        ` <a class="st-pair-swap" href="${href(current, b, a)}">⇄ Swap A and B</a>`}</div>
      <nav class="st-pair-views" aria-label="This pair">${VIEWS.map(([view, label]) => view === current ?
        `<span aria-current="page">${label.replace("&", "&amp;")}</span>` :
        `<a href="${href(view, a, b)}">${label.replace("&", "&amp;")}</a>`).join("")}${inPage ? "" :
        '<a class="st-pair-back" href="rivalry-v2.html">← Rivalry</a>'}</nav>`;
  }
  /* Fills every [data-pair-bar] on the page from the address bar. */
  async function mount(doc, search, fetcher) {
    const hosts = [...doc.querySelectorAll("[data-pair-bar]")], pair = parse(search);
    if (!hosts.length || !pair) return;
    let categories = [];
    try {
      const response = await fetcher("api/rivalry", {cache:"no-store"});
      if (response.ok) categories = (await response.json()).categories || [];
    } catch { /* the bar still links the pair by lap number */ }
    for (const host of hosts) {
      host.innerHTML = html(categories, pair[0], pair[1], host.dataset.pairBar);
      host.hidden = false;
    }
  }
  const bar = {parse, href, find, html, mount};
  if (typeof module !== "undefined" && module.exports) module.exports = bar;
  else {
    root.PairBar = bar;
    if (root.document?.querySelector?.("[data-pair-bar]"))
      mount(root.document, root.location.search, (...args) => root.fetch(...args));
  }
})(globalThis);
