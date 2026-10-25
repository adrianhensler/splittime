"use strict";
(function () {
  const M = globalThis.RivalryModel, $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char =>
    ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[char]));
  const HISTORY = ["best","all","improvements","flagged"];
  const WHY = {excluded:"Excluded", rewind:"Rewind · does not count", contact:"Contact · does not count",
    route_not_completed:"Route not completed · does not count", flagged:"Flagged · does not count",
    incomplete:"Incomplete"};
  const EST = "The game stopped sending data at the finish line, so this time is SplitTime’s last clock reading. The run covered the whole route.";
  const est = lap => M.estimated(lap) ? ` <abbr class="st-est" title="${EST}">est.</abbr>` : "";
  const state = {data:{categories:[],drivers:[]}, group:null, a:null, b:null, query:"", history:"best"};
  const debrief = globalThis.SessionDebrief ? new globalThis.SessionDebrief($("st-debrief")) : null;
  const raceReport = globalThis.RaceReport ? new globalThis.RaceReport($("st-race-report")) : null;
  const storageKey = `splittime-rivalry-v2:${globalThis.location?.pathname || ""}`;
  let saved = null;
  try {saved = JSON.parse(globalThis.sessionStorage?.getItem(storageKey) || "null");} catch { /* storage may be blocked */ }
  if (saved && typeof saved === "object") {
    state.group = typeof saved.group === "string" ? saved.group : null;
    state.query = typeof saved.query === "string" ? saved.query : "";
    state.history = HISTORY.includes(saved.history) ? saved.history : "best";
  }
  const outlines = new Map();
  let feed = [];
  const selected = () => state.data.categories.find(group => M.key(group) === state.group);
  function save() {
    const group = selected();
    saved = {group:state.group, query:state.query, history:state.history,
      a:M.identity(group?.attempts.find(lap => lap.lap_id === state.a)),
      b:M.identity(group?.attempts.find(lap => lap.lap_id === state.b))};
    try {globalThis.sessionStorage?.setItem(storageKey,JSON.stringify(saved));} catch { /* browsing still works */ }
  }
  const car = lap => `${esc(lap.car_name || "Unknown car")} · PI ${esc(lap.car_pi ?? "?")}`;
  const when = lap => lap.finished_at_utc && M.stamp(lap) !== null ? M.date(lap.finished_at_utc) :
    lap.started_at_utc ? `Started ${M.date(lap.started_at_utc)}` : "Time unknown";
  const mode = lap => ({rivals:"Rivals (guess)", race:"Race (guess)"}[lap.event_mode] || "Mode unknown");
  function status(lap) {
    if (!M.clean(lap)) return WHY[lap.not_best_because] || (lap.completion === "incomplete" ?
      "Incomplete" : "Does not count as a best");
    const how = M.estimated(lap) ? " · time from last packet" : "";
    if (lap.lead) return `Took recorded lead · PB −${lap.delta.toFixed(3)} s${how}`;
    if (lap.pb) return (lap.delta === null ? "First recorded best" : `PB −${lap.delta.toFixed(3)} s`) + how;
    return `Valid${how}`;
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
  // Open the analysis for the selected pair and bring it into view: the race
  // report when there are two laps, otherwise A's session debrief.
  function analyse() {
    const target = state.a && state.b ? $("st-race-report") : $("st-debrief");
    if (target) target.open = true;
    $("st-analysis").scrollIntoView?.({behavior:"smooth", block:"start"});
  }
  const label = group => `${esc(group.route_name)} · ${esc(group.car_class_label)}`;
  const others = (people, lap) => people.filter(d => d.id !== lap.driver_id).map(d => esc(d.name)).join(", ");
  function story(event, people) {
    const {kind, group, lap, rival, margin} = event, who = `<strong>${esc(lap.driver_name)}</strong>`;
    // either time read from the last packet makes the margin an estimate too
    const by = margin === null ? "" : `<span class="st-time">${margin.toFixed(3)} s</span>${
      M.estimated(lap) || (rival && M.estimated(rival)) ? ` <abbr class="st-est" title="${EST}">est.</abbr>` : ""}`;
    return {
      takeover: `${who} took ${label(group)} from ${esc(rival?.driver_name)} by ${by}`,
      extended: `${who} extended the lead on ${label(group)} to ${by}`,
      closing: `${who} closed to ${by} of ${esc(rival?.driver_name)} on ${label(group)}`,
      first: `${who} set the first time on ${label(group)}${est(lap)}${others(people,lap) ? ` · waiting on ${others(people,lap)}` : ""}`,
      unanswered: `${who} improved on ${label(group)}${est(lap)}${others(people,lap) ? ` · still no time from ${others(people,lap)}` : ""}`,
    }[kind];
  }
  // Takeovers and recent records across every group, above the table (ignores the search box).
  function latest(people) {
    const events = M.activity(state.data.categories, people);
    const takeover = events.find(event => event.kind === "takeover");
    const id = event => `${M.key(event.group)}|${event.lap.driver_id}`;  // newest per driver and group
    const seen = new Set(takeover ? [id(takeover)] : []), recent = [];
    for (const event of events) {
      if (seen.has(id(event))) continue;
      seen.add(id(event)); recent.push(event);
      if (recent.length === 4) break;
    }
    feed = [takeover, ...recent].filter(Boolean);
    const board = M.scoreboard(state.data.categories, people);
    const closest = state.data.categories.map(group => [group, M.standings(group)])
      .filter(([, [a,b]]) => a && b && b.time_s > a.time_s)
      .sort(([, x], [, y]) => (x[1].time_s-x[0].time_s)-(y[1].time_s-y[0].time_s))[0];
    const open = (index, lap, rival) => `<button type="button" data-feed="${index}">Open</button>${rival ?
      `<a href="replay.html?laps=${lap.lap_id},${rival.lap_id}">Replay</a>` : ""}`;
    $("st-latest").hidden = !events.length;
    $("st-latest").innerHTML = !events.length ? "" : `
      ${takeover ? `<div class="st-takeover"><span class="st-badge">Lead change · ${esc(M.ago(takeover.at))}</span>
        <p>${story(takeover, people)}</p><div class="st-row-actions">${open(0, takeover.lap, takeover.rival)}</div></div>` : ""}
      <p class="st-scoreboard">${board.drivers.map(d => `<strong>${esc(d.name)}</strong> leads ${d.leads}`).join(" · ")}
        <span class="st-quiet">of ${board.contested} contested · unanswered: ${board.drivers.map(d =>
          `${esc(d.name)} ${d.unanswered}`).join(", ")}${closest ? ` · closest: ${label(closest[0])},
          <span class="st-time">${(closest[1][1].time_s-closest[1][0].time_s).toFixed(3)} s</span>` : ""}</span></p>
      <ul class="st-recent">${recent.map((event, i) => `<li><span class="st-quiet">${esc(M.ago(event.at))}</span>
        <span>${story(event, people)}</span><span class="st-row-actions">${open(i + (takeover ? 1 : 0), event.lap, event.rival)}</span></li>`).join("")}</ul>`;
  }
  function choose(group) {
    state.group = M.key(group);
    [state.a,state.b] = M.defaults(group,M.drivers(state.data));
  }
  function render(refreshDebrief = false) {
    // Keep native restored form controls and the model in agreement on Back.
    $("st-find").value = state.query;
    $("st-history-filter").value = state.history;
    const drivers = M.drivers(state.data), categories = state.data.categories;
    latest(drivers);
    const shown = categories.filter(group => M.visible(group,state.query));
    if (shown.length && !shown.some(group => M.key(group) === state.group)) choose(shown[0]);
    $("st-overview-label").textContent = `${shown.length} of ${categories.length} route/class groups · recorded times`;
    $("st-event-columns").innerHTML = `<tr><th scope="col">Event / class</th>${drivers.map(d =>
      `<th scope="col">${esc(d.name)} <span class="st-sub">best</span></th>`).join("")}<th scope="col">Recorded gap</th><th scope="col">Latest progress</th></tr>`;
    $("st-events").innerHTML = shown.map((group,index) => {
      const best = M.bests(group), history = M.timeline(group,drivers);
      // fastest first, for however many drivers there are
      const order = M.standings(group), [a,b] = order;
      let gap = "No valid times yet";
      if (a && b) gap = (a.time_s === b.time_s ? "Equal recorded bests" :
        `${esc(a.driver_name)}<div class="st-time">${(b.time_s-a.time_s).toFixed(3)} s ahead</div>`) +
        // one click from the table to the two bests, leader as A
        `<div class="st-row-actions"><a href="replay.html?laps=${a.lap_id},${b.lap_id}">Replay</a>` +
        `<a href="${M.compare(a,b)}">Compare</a><a href="#st-analysis" data-analyse="${index}">Analyse</a></div>`;
      else if (a) {
        const waiting = drivers.filter(d => d.id !== a.driver_id);
        gap = !waiting.length ? "One driver recorded" :
          `Awaiting ${esc(waiting.length === 1 ? waiting[0].name : `${waiting.length} drivers`)}`;
      }
      const latest = history.find(lap => lap.pb);
      const progress = latest ? `${esc(when(latest))}<div>${esc(status(latest))}</div>` :
        history.some(lap => M.clean(lap)) ? "Record chronology unknown" :
        "No valid laps yet";
      return `<tr class="${M.key(group) === state.group ? "st-selected" : ""}"><td>
        <button class="st-route-button" type="button" data-event="${index}" aria-pressed="${M.key(group) === state.group}">
        ${route(group)}<span><span class="st-route-name">${esc(group.route_name)}</span><span class="st-quiet">
        ${esc(group.car_class_label)} class · ${group.attempts.length} attempts</span></span></button></td>
        ${drivers.map(d => {const lap = best.get(d.id); return `<td>${lap ?
          `<span class="st-time">${M.time(lap.time_s)}</span>${est(lap)}<div class="st-quiet">${car(lap)}</div><div class="st-quiet">${esc(when(lap))}</div>` :
          `<span class="st-quiet">No valid time yet</span>`}</td>`;}).join("")}
        <td class="st-quiet">${gap}</td><td class="st-quiet">${progress}</td></tr>`;
    }).join("") || `<tr><td colspan="${drivers.length+3}" class="st-empty">${categories.length ? "No recordings match your search." : "No recordings yet. Captured events will appear here."}</td></tr>`;
    $("st-context").hidden = !shown.length;
    if (!shown.length) {debrief?.setContext(null,null); raceReport?.setContext(null,null); save(); return;}
    const group = selected(), history = M.timeline(group,drivers);
    // "best": each driver's one best valid lap; everything else is a click away
    const top = new Set([...M.bests(group).values()].map(lap => lap.lap_id));
    const displayed = history.filter(lap => M.matches(group,lap,state.query) &&
      (state.history === "all" || state.history === "best" && top.has(lap.lap_id) ||
       state.history === "improvements" && lap.pb ||
       state.history === "flagged" && !M.clean(lap)));
    const others = history.length - top.size;
    $("st-more").hidden = !(state.history === "best" ? others > 0 : state.history === "all" && top.size);
    $("st-more").textContent = state.history === "best" ?
      `Show ${others} other lap${others === 1 ? "" : "s"}` : "Show best times only";
    $("st-event-heading").textContent = `${group.route_name} · ${group.car_class_label}`;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    $("st-event-meta").textContent = `${displayed.length} of ${history.length} attempts · ${zone} · select A and B to compare`;
    $("st-history").innerHTML = displayed.map(lap => `<tr><td><span class="st-time">${M.time(lap.time_s)}</span>${est(lap)}
      <div class="st-quiet ${M.clean(lap) ? "" : "st-warn"}">${esc(status(lap))}</div></td>
      <td>${esc(lap.driver_name)}<div class="st-quiet">${car(lap)}</div><div class="st-quiet">${esc(mode(lap))}</div></td>
      <td class="st-quiet">${esc(when(lap))}</td><td><div class="st-picks">${["a","b"].map(side =>
        `<label><input type="radio" name="pick-${side}" data-side="${side}" data-lap="${lap.lap_id}"
          ${state[side] === lap.lap_id ? "checked" : ""}
          ${!M.usable(lap) || state[side === "a" ? "b" : "a"] === lap.lap_id ? "disabled" : ""}
          aria-label="${side.toUpperCase()} ${esc(lap.driver_name)} lap ${lap.lap_id}, ${M.time(lap.time_s)}">${side.toUpperCase()}</label>`).join("")}</div></td></tr>`
    ).join("") || `<tr><td colspan="4" class="st-empty">${state.history === "best" && history.length ?
      "No valid time on this route and class yet." : "No attempts match this history view."}</td></tr>`;
    // the headline is route + class; the same route by car and overall sits right below
    const more = M.routeBests(categories,group.route_id);
    const cell = lap => `<span class="st-time">${M.time(lap.time_s)}</span>${est(lap)}`;
    $("st-more-bests").hidden = !more.cars.length;
    $("st-more-bests").innerHTML = more.cars.length ? `<h3>More bests on ${esc(group.route_name)}</h3>
      <div class="st-more-grid"><div class="st-scroll"><table aria-label="Best on this route in any class">
        <thead><tr><th scope="col">Overall · any class</th><th scope="col">Best</th><th scope="col">Car</th></tr></thead>
        <tbody>${[...more.overall.values()].sort((a,b) => a.time_s-b.time_s).map(lap => `<tr><td>${esc(lap.driver_name)}</td>
          <td>${cell(lap)}</td><td class="st-quiet">${car(lap)} · ${esc(lap.car_class_label)}</td></tr>`).join("")}</tbody></table></div>
      <div class="st-scroll"><table aria-label="Best on this route by car">
        <thead><tr><th scope="col">By car</th><th scope="col">Driver</th><th scope="col">Best</th></tr></thead>
        <tbody>${more.cars.map(lap => `<tr><td>${car(lap)} <span class="st-quiet">· ${esc(lap.car_class_label)}</span></td>
          <td>${esc(lap.driver_name)}</td><td>${cell(lap)}</td></tr>`).join("")}</tbody></table></div></div>` : "";
    const a = group.attempts.find(lap => lap.lap_id === state.a), b = group.attempts.find(lap => lap.lap_id === state.b);
    const href = M.compare(a,b), delta = href ? b.time_s-a.time_s : null;
    const started = (state.data.route_attempts?.routes || []).find(r => r.route_id === group.route_id);
    const starts = started ? M.drivers(state.data).filter(d => started.drivers[d.id]).map(d =>
      `${esc(d.name)} ${started.drivers[d.id].attempts} (${started.drivers[d.id].finished} finished)`).join(" · ") : "";
    $("st-inspector").innerHTML = `<div><span class="st-quiet">Recorded route</span>${route(group)}${starts ?
      `<p class="st-quiet" id="st-starts" title="Every time the event was started on this route, in any class. Given-up attempts are counted from the day this was added.">Starts: ${starts}</p>` : ""}</div><div>
      <strong>Selected comparison</strong>${[["A",a],["B",b]].map(([side,lap]) =>
        `<p><span class="st-time">${side} ${M.time(lap?.time_s)}</span><br><span class="st-quiet">${lap ? `${esc(lap.driver_name)} · lap ${lap.lap_id}` : "Choose a completed lap"}</span></p>`).join("")}
      <p>${href ? delta === 0 ? "Equal recorded times" : `${delta > 0 ? "A" : "B"} faster by <span class="st-time">${Math.abs(delta).toFixed(3)} s</span>` : "Choose two completed laps."}</p>
      <p class="st-quiet">${href && (!M.clean(a) || !M.clean(b)) ? "Includes a lap that does not count as a best · " : ""}Recorded difference · exploratory</p>
      ${href ? `<button type="button" class="st-compare" data-analyse>Analyse A vs B</button>
        <a class="st-replay" href="${href}">Compare traces &amp; corners</a>
        <a class="st-replay" href="replay.html?laps=${a.lap_id},${b.lap_id}">Replay A against B</a>` : '<span class="st-no-compare">Needs two completed laps</span>'}</div>`;
    $("st-analysis-pair").textContent = a && b ? `${a.driver_name} (A, ${M.time(a.time_s)}) vs ${b.driver_name} (B, ${M.time(b.time_s)}) · ` +
      "the race report explains where the time went; the session debrief reviews A's whole session." :
      a ? `${a.driver_name} (A) · choose a B lap for the race report.` : "Choose an A and a B lap above.";
    drawOutlines();
    debrief?.setContext(a,b,refreshDebrief);
    raceReport?.setContext(a,b,refreshDebrief);
    save();
  }
  async function load() {
    $("st-refresh").disabled = true;
    $("st-message").textContent = "Loading recordings…";
    const old = selected(), oldA = M.identity(old?.attempts.find(lap => lap.lap_id === state.a)) || saved?.a;
    const oldB = M.identity(old?.attempts.find(lap => lap.lap_id === state.b)) || saved?.b;
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
      render(true);
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
  $("st-inspector").addEventListener("click",event => {
    if (event.target.closest("[data-analyse]")) analyse();
  });
  $("st-events").addEventListener("click",event => {
    const row = event.target.closest("[data-analyse]");
    if (row) {
      event.preventDefault?.();
      // the row's two bests, leader as A, exactly as its Replay and Compare links
      const group = state.data.categories.filter(g => M.visible(g,state.query))[Number(row.dataset.analyse)];
      const [a,b] = M.standings(group);
      state.group = M.key(group); [state.a,state.b] = [a.lap_id,b.lap_id];
      render(); analyse(); return;
    }
    const button = event.target.closest("[data-event]");
    if (!button) return;
    const shown = state.data.categories.filter(group => M.visible(group,state.query));
    choose(shown[Number(button.dataset.event)]); render();
    $("st-events").querySelector(`[data-event="${button.dataset.event}"]`)?.focus();
  });
  $("st-latest").addEventListener("click",event => {
    const button = event.target.closest("[data-feed]"), item = feed[Number(button?.dataset.feed)];
    if (!item) return;
    // the story's own lap as A, against the best it was measured against as B;
    // with no rival then, B is another driver's best now, if there is one
    state.group = M.key(item.group); state.query = "";
    const answer = M.standings(item.group).find(lap => lap.driver_id !== item.lap.driver_id);
    [state.a,state.b] = [item.lap.lap_id, (item.rival || answer)?.lap_id ?? null];
    render();
    $("st-context").scrollIntoView?.({behavior:"smooth", block:"start"});
  });
  $("st-more").addEventListener("click",() => {
    state.history = state.history === "best" ? "all" : "best"; render();
    $("st-more").focus();
  });
  $("st-history").addEventListener("change",event => {
    const {side,lap} = event.target.dataset;
    if (!["a","b"].includes(side)) return;
    const id = Number(lap), record = selected().attempts.find(item => item.lap_id === id);
    if (!M.usable(record || {}) || state[side === "a" ? "b" : "a"] === id) return;
    state[side] = id; render();
    $("st-history").querySelector(`[data-side="${side}"][data-lap="${id}"]`)?.focus();
  });
  globalThis.addEventListener?.("pageshow", event => {
    $("st-find").value = state.query;
    $("st-history-filter").value = state.history;
    if (event.persisted && !$("st-refresh").disabled) load();
  });
  load();
})();
