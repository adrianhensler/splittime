"use strict";
(function () {
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c =>
    ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
  // a run can start recording a few metres before the line
  const km = m => `${(Math.max(0, m) / 1000).toFixed(1)} km`;
  const secs = value => `${Math.abs(value).toFixed(3)} s`;
  class RaceReport {
    constructor(host) {
      this.host = host; this.context = null; this.sequence = 0; this.busy = false;
      host.innerHTML = '<summary>Race report · choose A and B</summary><div class="st-race-content" aria-live="polite"></div>';
      this.content = host.querySelector("div");
      host.addEventListener("toggle", () => {if (host.open) this.load();});
      host.addEventListener("click", event => {
        const button = event.target.closest("[data-race]");
        if (button) this.load(button.dataset.race === "generate");
      });
    }
    setContext(a, b, refresh = false) {
      const next = a && b ? {lap_a:a.lap_id, lap_b:b.lap_id, a:a.driver_name, b:b.driver_name} : null;
      if (!refresh && JSON.stringify(next) === JSON.stringify(this.context)) return;
      this.context = next; ++this.sequence; this.controller?.abort(); this.busy = false;
      this.host.querySelector("summary").textContent = next ?
        `Race report · ${next.a} (A) vs ${next.b} (B)` : "Race report · choose A and B";
      this.content.textContent = next ? "Expand to see where the time went." : "Choose an A and a B lap.";
      if (this.host.open) this.load();
    }
    // The model writes {A} and {B}; names are filled in here, after escaping.
    named(text) {
      return esc(text).replaceAll("{A}", `<strong>${esc(this.context.a)}</strong>`)
        .replaceAll("{B}", `<strong>${esc(this.context.b)}</strong>`);
    }
    async load(generate = false) {
      if (this.busy || !this.context) return;
      const sequence = ++this.sequence, {lap_a,lap_b} = this.context;
      this.busy = true; this.controller?.abort(); this.controller = new AbortController();
      const status = this.content.querySelector(".st-race-status");
      if (generate && status) {
        for (const button of this.content.querySelectorAll("button")) button.disabled = true;
        status.textContent = "Writing the race report from the measured facts…";
      } else this.content.textContent = "Measuring both runs section by section…";
      try {
        const response = await fetch(generate ? "api/race-report/generate" :
          `api/race-report?lap_a=${lap_a}&lap_b=${lap_b}`, {cache:"no-store", signal:this.controller.signal,
          ...(generate ? {method:"POST", headers:{"Content-Type":"application/json"},
            body:JSON.stringify({lap_a,lap_b,retry:this.retry === true})} : {})});
        if (sequence !== this.sequence) return;
        if (response.status === 401 || response.status === 403 || response.redirected) {
          throw new Error("Sign in with SplitTime management access to write an AI race report. Measurements remain public.");
        }
        const data = await response.json();
        if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : `HTTP ${response.status}`);
        if (sequence === this.sequence) this.render(data);
      } catch (error) {
        if (sequence !== this.sequence || error.name === "AbortError") return;
        const target = generate ? this.content.querySelector(".st-race-status") : null;
        if (target) target.textContent = error.message;
        else this.content.textContent = error.message;
        if (target) for (const button of this.content.querySelectorAll("button")) button.disabled = false;
      } finally {if (sequence === this.sequence) this.busy = false;}
    }
    render(report) {
      const f = report.facts, ai = report.ai, {a, b} = this.context;
      const leader = f.a_gain_s >= 0 ? a : b, worst = Math.max(...f.sections.map(s => Math.abs(s.a_gain_s)), 0.001);
      this.retry = ["failed","uncertain"].includes(ai.state);
      const story = ai.narrative;
      const side = (name, notes) => `<div><h3>${esc(name)}</h3>
        ${notes.strengths.length ? `<p class="st-quiet">Strengths</p><ul>${notes.strengths.map(t => `<li>${this.named(t)}</li>`).join("")}</ul>` : ""}
        ${notes.costs.length ? `<p class="st-quiet">Cost time</p><ul>${notes.costs.map(t => `<li>${this.named(t)}</li>`).join("")}</ul>` : ""}
        <p><span class="st-quiet">Practice ·</span> ${this.named(notes.practice)}</p></div>`;
      const style = lap => `${lap.flat_pct}% full throttle · top ${lap.max_kmh} km/h · peak ${lap.max_g} g · ` +
        `${lap.pedals === "on_off" ? "on/off pedals" : "progressive pedals"}${lap.steering === "on_off" ? ", on/off steering" : ""}`;
      const state = !ai.enabled ? "AI is not configured; the measurements above are complete." :
        ai.state === "ready" ? `Written by Gemini 3.8 Flash from these measurements · $${ai.cost_or_reserved_usd.toFixed(5)}` :
        ai.state === "pending" ? "Being written. Reload to check; no second call will be made." :
        this.retry ? "The last attempt did not pass the fact check. Unknown charges stay reserved; retry is a new call." :
        "Optional: an AI race engineer writes the review from these measurements. Every number it uses must be one of them. Driver names are not sent.";
      const disabled = !ai.enabled || ["ready","pending"].includes(ai.state) || ai.budget.remaining_usd < 0.01;
      this.content.innerHTML = `
        <p class="st-race-headline"><strong>${esc(leader)}</strong> faster by <span class="st-time">${secs(f.a_gain_s)}</span>
          over ${km(f.route_m)}${f.same_car ? " · same car and PI" : " · different cars or PI"}</p>
        ${story ? `<div class="st-race-story"><p class="st-race-ai-headline">${this.named(story.headline)}</p><p>${this.named(story.story)}</p>
          <div class="st-debrief-grid">${side(a, story.a)}${side(b, story.b)}</div></div>` : ""}
        <h3>Where the time went</h3>
        <ol class="st-race-sections">${f.sections.map(s => {
          const gainer = s.a_gain_s >= 0 ? "a" : "b", width = Math.round(100 * Math.abs(s.a_gain_s) / worst);
          return `<li><span class="st-race-where">Section ${s.n} · ${km(s.from_m)}–${km(s.to_m)}${s.corners.length ? ` · C${s.corners.join(", C")}` : ""}</span>
            <span class="st-race-bar st-race-${gainer}" style="width:${width}%"></span>
            <span class="st-race-gain">${esc(gainer === "a" ? a : b)} +${secs(s.a_gain_s)}</span>
            <span class="st-quiet">Full throttle ${s.a.flat_pct}% / ${s.b.flat_pct}% · top ${s.a.max_kmh} / ${s.b.max_kmh} km/h · after: ${
              s.a_ahead_after_s === 0 ? "level" : `${esc(s.a_ahead_after_s > 0 ? a : b)} ahead by ${secs(s.a_ahead_after_s)}`}</span></li>`;
        }).join("")}</ol>
        <h3>Biggest corners</h3>
        <ul>${f.corners.map(c => `<li><strong>C${c.c}</strong> · ${esc(c.a_gain_s >= 0 ? a : b)} +${secs(c.a_gain_s)} —
          A ${c.a.gear ? `gear ${c.a.gear}, ` : ""}min ${c.a.min_kmh ?? "—"} km/h, exit ${c.a.exit_kmh ?? "—"} ·
          B ${c.b.gear ? `gear ${c.b.gear}, ` : ""}min ${c.b.min_kmh ?? "—"} km/h, exit ${c.b.exit_kmh ?? "—"}</li>`).join("")}</ul>
        <p class="st-quiet">A · ${esc(a)}: ${style(f.lap.a)}<br>B · ${esc(b)}: ${style(f.lap.b)}</p>
        <p class="st-quiet st-race-status">${esc(state)}</p>
        <div class="st-debrief-actions"><button type="button" data-race="generate" ${disabled ? "disabled" : ""}>${this.retry ? "Retry AI race report" : "Write AI race report"}</button>
          <a href="replay.html?laps=${report.lap_a},${report.lap_b}">Replay A against B</a></div>
        <p class="st-quiet">Management login required to write · shares the debrief’s $1 / UTC month cap · $${ai.budget.remaining_usd.toFixed(3)} remaining.
          Corner numbers use reference lap ${report.reference_lap_id}.</p>
        <ul class="st-quiet st-debrief-warnings">${report.warnings.map(w => `<li>${esc(w)}</li>`).join("")}</ul>`;
    }
  }
  globalThis.RaceReport = RaceReport;
})();
