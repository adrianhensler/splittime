"use strict";
(function () {
  const M = globalThis.RivalryModel, $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char =>
    ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[char]));
  const state = {data:{categories:[],drivers:[]}, group:null, a:null, b:null, query:"", history:"all"};
  const outlines = new Map();
  const selected = () => state.data.categories.find(group => M.key(group) === state.group);
  const car = lap => `${esc(lap.car_name || "Unknown car")} · PI ${esc(lap.car_pi ?? "?")}`;
  const when = lap => lap.finished_at_utc && M.stamp(lap) !== null ? M.date(lap.finished_at_utc) :
    lap.started_at_utc ? `Started ${M.date(lap.started_at_utc)}` : "Time unknown";
  const mode = lap => ({rivals:"Rivals (guess)", race:"Race (guess)"}[lap.event_mode] || "Mode unknown");
  function status(lap) {
    const flags = (lap.flags || []).join(", ");
    if (lap.completion === "provisional") return `Estimated finish${flags ? ` · ${flags}` : ""}`;
    if (lap.completion !== "complete") return "Incomplete";
    if (lap.validity === "excluded") return "Excluded";
    if (flags) return flags;
    if (lap.lead) return `Took recorded lead · PB −${lap.delta.toFixed(3)} s`;
    if (lap.pb) return lap.delta === null ? "First recorded best" : `PB −${lap.delta.toFixed(3)} s`;
    return M.clean(lap) ? "Unflagged" : "Not eligible for best";
  }
  function route(group) {
    const known = Number.isSafeInteger(group.route_id) && group.route_id > 0;
    return `<span class="st-route-host" ${known ? `data-route="${group.route_id}"` : ""}
      aria-label="Recorded outline of ${esc(group.route_name)}">${known ? "Outline loading…" : "No outline"}</span>`;
  }
  function drawOutlines() {
    for (const host of document.querySelectorAll("[data-route]")) {
      const points = outlines.get(Number(host.dataset.route));
      if (points === undefined) continue;
      if (!points || points.length < 4 || points.length % 2 || !points.every(Number.isFinite)) {
        host.textContent = "No outline"; continue;
      }
      const xs = points.filter((_,i) => i % 2 === 0), ys = points.filter((_,i) => i % 2);
      const left = Math.min(...xs), top = Math.min(...ys);
      const width = Math.max(...xs)-left, height = Math.max(...ys)-top;
      const path = points.reduce((d,n,i) => d+(i%2 ? `${n} ` : `${i ? "L" : "M"}${n} `), "");
      host.innerHTML = `<svg class="st-route" viewBox="${left-30} ${top-30} ${width+60} ${height+60}" aria-hidden="true"><path d="${path}"/></svg>`;
    }
  }
  function choose(group) {
    state.group = M.key(group);
    [state.a,state.b] = M.defaults(group,M.drivers(state.data));
  }
  function render() {
    const drivers = M.drivers(state.data), categories = state.data.categories;
    const shown = categories.filter(group => M.visible(group,state.query));
    if (shown.length && !shown.some(group => M.key(group) === state.group)) choose(shown[0]);
    $("st-overview-label").textContent = `${shown.length} of ${categories.length} route/class groups · recorded times`;
    $("st-event-columns").innerHTML = `<tr><th scope="col">Event / class</th>${drivers.map(d =>
      `<th scope="col">${esc(d.name)} <span class="st-sub">best</span></th>`).join("")}<th scope="col">Recorded gap</th><th scope="col">Latest progress</th></tr>`;
    $("st-events").innerHTML = shown.map((group,index) => {
      const best = M.bests(group), history = M.timeline(group,drivers);
      const a = best.get(drivers[0]?.id), b = best.get(drivers[1]?.id);
      let gap = "No unflagged bests";
      if (a && b) gap = a.time_s === b.time_s ? "Equal recorded bests" :
        `${esc(a.time_s < b.time_s ? drivers[0].name : drivers[1].name)}<div class="st-time">${Math.abs(a.time_s-b.time_s).toFixed(3)} s ahead</div>`;
      else if (a || b) gap = drivers.length >= 2 ?
        `Awaiting ${esc(a ? drivers[1].name : drivers[0].name)}` : "One driver recorded";
      const latest = history.find(lap => lap.pb);
      const progress = latest ? `${esc(when(latest))}<div>${esc(status(latest))}</div>` :
        history.some(lap => M.clean(lap)) ? "Record chronology unknown" :
        history.some(lap => lap.completion === "provisional") ? "Estimated finishes" : "Flagged / incomplete attempts";
      return `<tr class="${M.key(group) === state.group ? "st-selected" : ""}"><td>
        <button class="st-route-button" type="button" data-event="${index}" aria-pressed="${M.key(group) === state.group}">
        ${route(group)}<span><span class="st-route-name">${esc(group.route_name)}</span><span class="st-quiet">
        ${esc(group.car_class_label)} class · ${group.attempts.length} attempts</span></span></button></td>
        ${drivers.map(d => {const lap = best.get(d.id); return `<td>${lap ?
          `<span class="st-time">${M.time(lap.time_s)}</span><div class="st-quiet">${car(lap)}</div><div class="st-quiet">${esc(when(lap))}</div>` :
          `<span class="st-quiet">No unflagged best</span>`}</td>`;}).join("")}
        <td class="st-quiet">${gap}</td><td class="st-quiet">${progress}</td></tr>`;
    }).join("") || `<tr><td colspan="${drivers.length+3}" class="st-empty">${categories.length ? "No recordings match your search." : "No recordings yet. Captured events will appear here."}</td></tr>`;
    $("st-context").hidden = !shown.length;
    if (!shown.length) return;
    const group = selected(), history = M.timeline(group,drivers);
    const displayed = history.filter(lap => M.matches(group,lap,state.query) &&
      (state.history === "all" || state.history === "improvements" && lap.pb ||
       state.history === "flagged" && !M.clean(lap)));
    $("st-event-heading").textContent = `${group.route_name} · ${group.car_class_label}`;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    $("st-event-meta").textContent = `${displayed.length} of ${history.length} attempts · ${zone} · select A and B to compare`;
    $("st-history").innerHTML = displayed.map(lap => `<tr><td><span class="st-time">${M.time(lap.time_s)}</span>
      <div class="st-quiet ${M.clean(lap) ? "" : "st-warn"}">${esc(status(lap))}</div></td>
      <td>${esc(lap.driver_name)}<div class="st-quiet">${car(lap)}</div><div class="st-quiet">${esc(mode(lap))}</div></td>
      <td class="st-quiet">${esc(when(lap))}</td><td><div class="st-picks">${["a","b"].map(side =>
        `<label><input type="radio" name="pick-${side}" data-side="${side}" data-lap="${lap.lap_id}"
          ${state[side] === lap.lap_id ? "checked" : ""}
          ${!M.usable(lap) || state[side === "a" ? "b" : "a"] === lap.lap_id ? "disabled" : ""}
          aria-label="${side.toUpperCase()} ${esc(lap.driver_name)} lap ${lap.lap_id}, ${M.time(lap.time_s)}">${side.toUpperCase()}</label>`).join("")}</div></td></tr>`
    ).join("") || '<tr><td colspan="4" class="st-empty">No attempts match this history view.</td></tr>';
    const a = group.attempts.find(lap => lap.lap_id === state.a), b = group.attempts.find(lap => lap.lap_id === state.b);
    const href = M.compare(a,b), delta = href ? b.time_s-a.time_s : null;
    $("st-inspector").innerHTML = `<div><span class="st-quiet">Recorded route</span>${route(group)}</div><div>
      <strong>Selected comparison</strong>${[["A",a],["B",b]].map(([side,lap]) =>
        `<p><span class="st-time">${side} ${M.time(lap?.time_s)}</span><br><span class="st-quiet">${lap ? `${esc(lap.driver_name)} · lap ${lap.lap_id}` : "Choose a completed lap"}</span></p>`).join("")}
      <p>${href ? delta === 0 ? "Equal recorded times" : `${delta > 0 ? "A" : "B"} faster by <span class="st-time">${Math.abs(delta).toFixed(3)} s</span>` : "Choose two completed laps."}</p>
      <p class="st-quiet">${href && (!M.clean(a) || !M.clean(b)) ? "Flagged lap included · " : ""}Recorded difference · exploratory</p>
      ${href ? `<a class="st-compare" href="${href}">Compare traces &amp; corners</a>` : '<span class="st-no-compare">Needs two completed laps</span>'}</div>`;
    drawOutlines();
  }
  async function load() {
    $("st-refresh").disabled = true;
    $("st-message").textContent = "Loading recordings…";
    const old = selected(), oldA = M.identity(old?.attempts.find(lap => lap.lap_id === state.a));
    const oldB = M.identity(old?.attempts.find(lap => lap.lap_id === state.b));
    try {
      const response = await fetch("api/rivalry", {cache:"no-store"});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.categories) || !Array.isArray(data.drivers) ||
          data.categories.some(group => !Array.isArray(group.attempts))) throw new Error("Invalid response");
      state.data = data;
      const next = selected();
      if (next) {
        const defaults = M.defaults(next,M.drivers(data));
        const a = next.attempts.find(lap => M.usable(lap) && M.identity(lap) === oldA);
        const b = next.attempts.find(lap => M.usable(lap) && M.identity(lap) === oldB);
        [state.a,state.b] = a && b && a.lap_id !== b.lap_id ? [a.lap_id,b.lap_id] : defaults;
      } else if (data.categories.length) {
        const latest = [...data.categories].sort((a,b) => Math.max(0,...b.attempts.filter(M.clean).map(lap => M.stamp(lap) || 0)) -
          Math.max(0,...a.attempts.filter(M.clean).map(lap => M.stamp(lap) || 0)))[0];
        choose(latest);
      }
      render();
      $("st-message").textContent = `${data.categories.reduce((n,g) => n+g.attempts.length,0)} attempts · refreshed ${new Date().toLocaleTimeString()}`;
      // Fetch each unique outline once per refresh, without replacing focused controls.
      const ids = [...new Set(data.categories.map(g => g.route_id).filter(id => Number.isSafeInteger(id) && id > 0))];
      await Promise.all(ids.map(async id => {
        try {
          const res = await fetch(`api/routes/${id}/outline`);
          outlines.set(id,res.ok ? (await res.json()).outline : null);
        } catch {outlines.set(id,null);}
        drawOutlines();
      }));
    } catch (error) {
      $("st-message").textContent = `Could not refresh recordings (${error.message}). ${state.data.categories.length ? "Previous results remain; they may be stale." : "Try Refresh again."}`;
    } finally {$("st-refresh").disabled = false;}
  }
  $("st-refresh").addEventListener("click",load);
  $("st-find").addEventListener("input",event => {state.query = event.target.value; render();});
  $("st-history-filter").addEventListener("change",event => {state.history = event.target.value; render();});
  $("st-events").addEventListener("click",event => {
    const button = event.target.closest("[data-event]");
    if (!button) return;
    const shown = state.data.categories.filter(group => M.visible(group,state.query));
    choose(shown[Number(button.dataset.event)]); render();
    $("st-events").querySelector(`[data-event="${button.dataset.event}"]`)?.focus();
  });
  $("st-history").addEventListener("change",event => {
    const {side,lap} = event.target.dataset;
    if (!["a","b"].includes(side)) return;
    const id = Number(lap), record = selected().attempts.find(item => item.lap_id === id);
    if (!M.usable(record || {}) || state[side === "a" ? "b" : "a"] === id) return;
    state[side] = id; render();
    $("st-history").querySelector(`[data-side="${side}"][data-lap="${id}"]`)?.focus();
  });
  load();
})();
