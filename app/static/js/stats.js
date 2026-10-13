"use strict";
/* Renders whatever sections app/stats.py sends: one collapsible block each,
   tables inside. Adding a statistic is a server change only. */
(function () {
  const M = globalThis.RivalryModel, $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char =>
    ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[char]));
  const storageKey = `splittime-stats-open:${globalThis.location?.pathname || ""}`;
  let open = new Set(["overview","leaderboard"]);
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(storageKey) || "null");
    if (Array.isArray(saved)) open = new Set(saved.filter(id => typeof id === "string"));
  } catch { /* storage may be blocked; the defaults still work */ }
  const remember = () => {
    try {globalThis.localStorage?.setItem(storageKey,JSON.stringify([...open]));} catch { /* fine */ }
  };
  function duration(seconds) {
    if (!Number.isFinite(seconds)) return "—";
    const m = Math.round(seconds / 60);
    return m < 1 ? `${Math.round(seconds)} s` : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2,"0")} min`;
  }
  const EST = "The game stopped sending data at the finish line, so this time is SplitTime’s last clock reading. The run covered the whole route.";
  const numeric = new Set(["int","time","duration","pct","gap"]);
  function format(kind, value) {
    if (value === null || value === undefined || value === "") return "—";
    if (kind === "time") return M.time(value);
    if (kind === "duration") return duration(value);
    if (kind === "pct") return `${Math.round(value * 100)}%`;
    if (kind === "gap") return `${Number(value).toFixed(3)} s`;
    if (kind === "date") return M.date(value);
    if (kind === "int") return Number(value).toLocaleString();
    return String(value);
  }
  function table(t, section) {
    const cell = (value, column) => {
      const kind = value && typeof value === "object" ? value.kind : column.kind;
      const raw = value && typeof value === "object" ? value.value : value;
      const est = value && typeof value === "object" && value.est ?
        ` <abbr class="st-est" title="${EST}">est.</abbr>` : "";
      return `<td class="${numeric.has(kind) ? "st-num" : ""}">${esc(format(kind,raw))}${est}</td>`;
    };
    const right = column => numeric.has(column.kind) || t.per_driver && column !== t.columns[0];
    return `<div>${t.title === section.title ? "" : `<h3>${esc(t.title)}</h3>`}<div class="st-scroll"><table>
      <thead><tr>${t.columns.map(c => `<th scope="col" class="${right(c) ? "st-num" : ""}">${esc(c.label)}</th>`).join("")}</tr></thead>
      <tbody>${t.rows.map(row => `<tr>${row.map((v,i) => cell(v,t.columns[i])).join("")}</tr>`).join("")}</tbody>
    </table></div>${t.note ? `<p class="st-note">${esc(t.note)}</p>` : ""}</div>`;
  }
  function render(data) {
    const sections = data.sections.filter(s => s.tables.length);
    $("st-sections").innerHTML = sections.map(s => `<details class="st-section" data-section="${esc(s.id)}" ${open.has(s.id) ? "open" : ""}>
      <summary>${esc(s.title)} <span>${s.tables.filter(t => t.title !== s.title).map(t => esc(t.title)).join(" · ")}</span></summary>
      <div class="st-section-body">${s.tables.map(t => table(t,s)).join("")}</div></details>`).join("") ||
      '<p class="st-empty">No recordings yet. Statistics appear after the first timed lap.</p>';
    const t = data.totals, span = data.span;
    $("st-stats-label").textContent = `${t.sessions} sessions · ${t.laps} timed laps · ${t.valid} valid · ${t.routes} routes` +
      (span.first_utc ? ` · since ${M.date(span.first_utc,{hour:undefined,minute:undefined})}` : "");
    $("st-open-all").textContent = sections.every(s => open.has(s.id)) ? "Close all" : "Open all";
  }
  let last = null;
  async function load() {
    $("st-refresh").disabled = true;
    $("st-message").textContent = "Loading statistics…";
    try {
      const response = await fetch("api/stats", {cache:"no-store"});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.sections)) throw new Error("Invalid response");
      last = data; render(data);
      $("st-message").textContent = `Refreshed ${new Date().toLocaleTimeString()}`;
    } catch (error) {
      $("st-message").textContent = `Could not load statistics (${error.message}). ${last ? "Previous numbers remain; they may be stale." : "Try Refresh again."}`;
    } finally {$("st-refresh").disabled = false;}
  }
  $("st-sections").addEventListener("toggle", event => {
    const id = event.target.dataset?.section;
    if (!id) return;
    if (event.target.open) open.add(id); else open.delete(id);
    remember();
    if (last) $("st-open-all").textContent = last.sections.filter(s => s.tables.length).every(s => open.has(s.id)) ? "Close all" : "Open all";
  }, true);
  $("st-open-all").addEventListener("click", () => {
    if (!last) return;
    const ids = last.sections.filter(s => s.tables.length).map(s => s.id);
    open = ids.every(id => open.has(id)) ? new Set() : new Set(ids);
    remember(); render(last);
  });
  $("st-refresh").addEventListener("click",load);
  load();
})();
