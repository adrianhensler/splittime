"use strict";
/* Weekly recap (ADR 35): each week's measured facts, newest first, with the AI
   column when one has been written. The server stores driver and route names
   as {D1}, {R1}, ...; they are filled in here, after escaping. */
(function () {
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char =>
    ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[char]));
  function time(value) {
    if (!Number.isFinite(value) || value <= 0) return "—";
    const ms = Math.round(value * 1000), m = Math.floor(ms / 60000);
    return `${m}:${String(Math.floor(ms / 1000) % 60).padStart(2,"0")}.${String(ms % 1000).padStart(3,"0")}`;
  }
  // dates arrive as plain ISO days; never shift them through a time zone
  const day = (iso, options) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined,
    {timeZone:"UTC", ...options});
  const EST = "The game stopped sending data at the finish line, so this time is SplitTime’s last clock reading. The run covered the whole route.";
  const est = flag => flag ? ` <abbr class="st-est" title="${EST}">est.</abbr>` : "";
  const named = (text, tags) => esc(text).replace(/\{([A-Z][A-Z0-9]*)\}/g, (mark, key) =>
    key in tags ? `<strong>${esc(tags[key])}</strong>` : mark);

  function column(week) {
    const ai = week.ai, story = ai.narrative, tags = week.tags;
    const state = !week.complete ? "The week is not over: its recap is written once it ends." :
      !ai.enabled ? "AI is not configured; the measured week below is complete." :
      ai.state === "ready" ? `Written by Gemini 3.8 Flash from these measurements · $${ai.cost_or_reserved_usd.toFixed(5)}` :
      ai.state === "pending" ? "Being written. Reload to check; no second call will be made." :
      ["failed","uncertain"].includes(ai.state) ? "The last attempt did not pass the fact check. Unknown charges stay reserved; retry is a new call." :
      "Written automatically the Monday after a week ends, or now with the button. Every number it uses must be one of the measurements. Gamertags and route names are sent.";
    const retry = ["failed","uncertain"].includes(ai.state);
    const can = week.complete && ai.enabled && !["ready","pending"].includes(ai.state) && ai.budget.remaining_usd >= 0.01;
    return `${story ? `<p class="st-race-ai-headline">${named(story.headline, tags)}</p><p>${named(story.story, tags)}</p>
      ${story.highlights.length ? `<ul>${story.highlights.map(t => `<li>${named(t, tags)}</li>`).join("")}</ul>` : ""}
      <p><span class="st-quiet">Next week ·</span> ${named(story.next_week, tags)}</p>` : ""}
      <p class="st-quiet st-recap-status">${esc(state)}</p>
      ${week.complete && ai.state !== "ready" ? `<div class="st-debrief-actions"><button type="button" data-recap="${esc(week.week)}" data-retry="${retry}" ${can ? "" : "disabled"}>${retry ? "Retry AI recap" : "Write AI recap"}</button></div>
      <p class="st-quiet">Writing one needs a signed-in SplitTime account · shared AI budget $1 / UTC month · $${ai.budget.remaining_usd.toFixed(3)} left.</p>` : ""}`;
  }

  const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ({1:"st", 2:"nd", 3:"rd"}[n % 10] || "th"));
  // ADR 38: measured, dated by the lap that reached it; new routes are grouped per driver
  function milestones(week) {
    const items = week.milestones || [], firsts = new Map(), out = [];
    for (const m of items) {
      if (m.kind === "new_route") {
        if (!firsts.has(m.driver)) {firsts.set(m.driver, []); out.push({kind:"new_route", driver:m.driver});}
        firsts.get(m.driver).push(m.route);
      } else if (m.kind === "pb_streak") {
        // a run that grows within the week is one line, at its longest
        const earlier = out.findIndex(o => o.kind === "pb_streak" && o.driver === m.driver);
        if (earlier < 0) out.push(m); else out[earlier] = m;
      } else if (["laps", "first_ahead"].includes(m.kind)) out.push(m);
    }
    const line = m => `<li><strong>${esc(m.driver)}</strong> · ${
      m.kind === "new_route" ? `first ${firsts.get(m.driver).length > 1 ? "laps" : "lap"} on ${firsts.get(m.driver).map(esc).join(", ")}` :
      m.kind === "laps" ? `${ordinal(m.count)} lap` :
      m.kind === "pb_streak" ? `a personal best in ${m.sessions} sessions running` :
      m.kind === "first_ahead" ? `ahead on ${esc(m.route)} (${esc(m.class)}) for the first time, <span class="st-time">${time(m.time_s)}</span>${est(m.estimated_finish)} to ${esc(m.over)}’s <span class="st-time">${time(m.over_time_s)}</span>${est(m.over_estimated_finish)}` : ""}</li>`;  // kinds are filtered above
    return out.length ? `<h3>Milestones</h3><ul>${out.map(line).join("")}</ul>` : "";
  }

  function measured(week) {
    const f = week.facts, rows = f.drivers;
    const drivers = `<div class="st-scroll"><table><thead><tr><th scope="col">Driver</th>
      <th scope="col" class="st-num">Laps</th><th scope="col" class="st-num">Valid</th><th scope="col" class="st-num">Sessions</th>
      <th scope="col" class="st-num">Routes</th><th scope="col" class="st-num">New routes</th><th scope="col" class="st-num">Personal bests</th>
      <th scope="col" class="st-num">Records held</th></tr></thead><tbody>${rows.map(d => `<tr><td>${esc(d.driver)}</td>
      <td class="st-num">${d.laps}</td><td class="st-num">${d.clean_laps}</td><td class="st-num">${d.sessions}</td>
      <td class="st-num">${d.routes}</td><td class="st-num">${d.new_routes}</td><td class="st-num">${d.personal_bests}</td>
      <td class="st-num">${d.records_held_before === d.records_held ? d.records_held : `${d.records_held_before} → ${d.records_held}`}</td></tr>`).join("")}
      </tbody></table></div>`;
    const bests = f.personal_bests.length ? `<h3>Personal bests</h3><ul>${f.personal_bests.map(b =>
      `<li><strong>${esc(b.driver)}</strong> · ${esc(b.route)} (${esc(b.class)}) · <span class="st-time">${time(b.time_s)}</span>${est(b.estimated_finish)}${
        b.improved_s === undefined ? " · first time" : ` · ${b.improved_s.toFixed(3)} s quicker than ${time(b.previous_time_s)}${est(b.previous_estimated_finish)}`}</li>`).join("")}</ul>` : "";
    const records = f.records_changed.length ? `<h3>Records that changed hands</h3><ul>${f.records_changed.map(r =>
      `<li>${esc(r.route)} (${esc(r.class)}) · <strong>${esc(r.new_holder)}</strong> takes it from ${esc(r.previous_holder)} with
        <span class="st-time">${time(r.time_s)}</span>${est(r.estimated_finish)}, by ${r.margin_s.toFixed(3)} s${
          r.estimated_finish || r.previous_estimated_finish ? " (from an estimated time)" : ""}</li>`).join("")}</ul>` : "";
    // where each gap is: the pair's race report measures it section by section
    const reach = (f.within_reach || []).length ? `<h3>Within reach</h3><ul>${f.within_reach.map((r, i) => {
      const pair = (week.reach_laps || [])[i]?.map(Number).filter(Number.isInteger);
      return `<li><strong>${esc(r.driver)}</strong> · ${esc(r.route)} (${esc(r.class)}) · <span class="st-time">${time(r.time_s)}</span>${est(r.estimated_finish)},
        ${r.gap_s.toFixed(3)} s off ${esc(r.holder)}’s <span class="st-time">${time(r.record_time_s)}</span>${est(r.record_estimated_finish)}${
        pair?.length === 2 ? ` · <a href="rivalry-v2.html?laps=${pair[0]},${pair[1]}#st-analysis">Where the gap is</a> · <a href="replay.html?laps=${pair[0]},${pair[1]}">Replay</a>` : ""}</li>`;
    }).join("")}</ul>` : "";
    const busiest = f.busiest_route ? `<p class="st-quiet">Busiest route: ${esc(f.busiest_route.route)} (${esc(f.busiest_route.class)}),
      ${f.busiest_route.laps} laps · ${f.contested_routes} routes have times from two or more drivers.</p>` : "";
    return drivers + milestones(week) + bests + records + reach + busiest;
  }

  function html(data) {
    if (!data.weeks.length) return '<p class="st-empty">No recordings yet. A week appears here after its first lap.</p>';
    const newest = data.weeks.find(w => w.complete)?.week;
    return data.weeks.map(week => `<details class="st-debrief st-recap" ${week.week === newest || !week.complete ? "open" : ""}>
      <summary>${week.complete ? "Week of" : "This week so far ·"} ${esc(day(week.week, {weekday:"short", day:"numeric", month:"short"}))} –
        ${esc(day(week.last_day, {weekday:"short", day:"numeric", month:"short"}))} · ${week.facts.laps} laps</summary>
      <div class="st-race-story">${column(week)}</div>${measured(week)}</details>`).join("");
  }

  globalThis.Recap = {html, named};
  if (typeof document === "undefined" || !document.getElementById("st-weeks")) return;
  const $ = id => document.getElementById(id);
  let busy = false;
  async function load() {
    $("st-refresh").disabled = true;
    $("st-message").textContent = "Loading the weeks…";
    try {
      const response = await fetch("api/recap", {cache:"no-store"});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      $("st-weeks").innerHTML = html(data);
      $("st-recap-label").textContent = `Weeks run Monday to Sunday, ${data.time_zone.replace("_"," ")} time`;
      $("st-message").textContent = `Refreshed ${new Date().toLocaleTimeString()}`;
    } catch (error) {
      $("st-message").textContent = `Could not load the recaps (${error.message}). Try Refresh again.`;
    } finally {$("st-refresh").disabled = false;}
  }
  $("st-weeks").addEventListener("click", async event => {
    const button = event.target.closest("[data-recap]");
    if (!button || busy) return;
    busy = true; button.disabled = true;
    const status = button.closest(".st-race-story").querySelector(".st-recap-status");
    status.textContent = "Writing the recap from the measured week…";
    try {
      const response = await fetch("api/recap/generate", {method:"POST", cache:"no-store",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({week:button.dataset.recap, retry:button.dataset.retry === "true"})});
      if (response.status === 401 || response.status === 403 || response.redirected)
        throw new Error("This needs a signed-in account with SplitTime access to write an AI recap. If you are signed in, an admin can add you to SplitTime. The measured weeks remain public.");
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : `HTTP ${response.status}`);
      await load();
    } catch (error) {
      status.textContent = error.message; button.disabled = false;
    } finally {busy = false;}
  });
  $("st-refresh").addEventListener("click", load);
  load();
})();
