"use strict";
(function () {
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c =>
    ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
  const time = value => value == null ? "—" : globalThis.RivalryModel.time(value);
  class SessionDebrief {
    constructor(host) {
      this.host = host; this.context = null; this.sequence = 0; this.busy = false;
      host.innerHTML = '<summary>Session debrief · select A to review its session</summary><div class="st-debrief-content" aria-live="polite"></div>';
      this.content = host.querySelector("div");
      host.addEventListener("toggle", () => {if (host.open) this.load();});
      host.addEventListener("click", event => {
        const button = event.target.closest("[data-debrief]");
        if (!button) return;
        if (button.dataset.debrief === "generate") this.load(true);
        else this.load();
      });
    }
    setContext(a, b, refresh = false) {
      const next = a ? {lap_a:a.lap_id, lap_b:b?.lap_id ?? null, name:a.driver_name, session:a.session_id} : null;
      if (!refresh && JSON.stringify(next) === JSON.stringify(this.context)) return;
      this.context = next; ++this.sequence; this.controller?.abort(); this.busy = false;
      this.host.querySelector("summary").textContent = a ?
        `Session debrief · ${a.driver_name} · session ${a.session_id} · A vs ${b ? "B" : "no reference"}` :
        "Session debrief · choose an A lap";
      this.content.textContent = "Expand to review measured session results.";
      if (this.host.open) this.load();
    }
    async load(generate = false) {
      if (this.busy) return;
      if (!this.context) {this.content.textContent = "Choose an A lap from this event."; return;}
      const sequence = ++this.sequence, {lap_a,lap_b} = this.context;
      this.busy = true; this.controller?.abort(); this.controller = new AbortController();
      if (generate) {
        for (const button of this.content.querySelectorAll("button")) button.disabled = true;
        this.content.querySelector(".st-debrief-status").textContent = "Gemini is prioritizing the measured facts…";
      } else this.content.textContent = "Loading session measurements…";
      try {
        const url = generate ? "api/debrief/generate" :
          `api/debrief?lap_a=${lap_a}${lap_b == null ? "" : `&lap_b=${lap_b}`}`;
        const response = await fetch(url, {cache:"no-store", signal:this.controller.signal,
          ...(generate ? {method:"POST", headers:{"Content-Type":"application/json"},
            body:JSON.stringify({lap_a,lap_b,retry:this.retry === true})} : {})});
        if (sequence !== this.sequence) return;
        if (response.status === 401 || response.status === 403 || response.redirected) {
          throw new Error("This needs a signed-in account with SplitTime access to generate an AI debrief. If you are signed in, an admin can add you to SplitTime. Measurements remain public.");
        }
        const data = await response.json();
        if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : `HTTP ${response.status}`);
        if (sequence !== this.sequence) return;
        this.render(data);
      } catch (error) {
        if (sequence === this.sequence && error.name !== "AbortError") {
          if (generate) this.content.querySelector(".st-debrief-status").textContent = error.message;
          else this.content.textContent = error.message;
          const button = document.createElement("button"); button.type = "button";
          button.dataset.debrief = "refresh"; button.textContent = "Reload measured debrief";
          this.content.append(button);
        }
      } finally {if (sequence === this.sequence) this.busy = false;}
    }
    render(report) {
      const s = report.stats, ai = report.ai, pair = report.pair;
      const corners = report.facts.filter(f => f.id.startsWith("corner_"));
      const progress = report.facts.find(f => f.id === "progress");
      const compare = pair ? `compare.html?lap_a=${pair.a}&lap_b=${pair.b}` : null;
      this.retry = ["failed","uncertain"].includes(ai.state);
      const explanation = ai.explanation;
      const status = !ai.enabled ? "AI is not configured; measured results are available." :
        ai.state === "ready" ? `Cached Gemini 3.8 Flash priorities · $${ai.cost_or_reserved_usd.toFixed(5)}` :
        ai.state === "pending" ? "Generation is in progress. Reload to check; no second call will be made." :
        this.retry ? "The last call did not produce a usable report. Unknown charges remain reserved. Retry is an explicit new call." :
        "Optional: Gemini prioritizes anonymous statistics and suggests one practice focus. No raw packets or driver names are sent.";
      const disabled = !ai.enabled || ["ready","pending"].includes(ai.state) || ai.budget.remaining_usd < 0.01;
      this.content.innerHTML = `<div class="st-debrief-stats">
        <div><strong>${s.laps_runs}</strong><span>Laps / runs · ${s.eligible} eligible</span></div>
        <div><strong>${time(s.best_s)}${s.best_estimated ? " est." : ""}</strong><span>Session recorded best</span></div>
        <div><strong>${time(s.median_s)}</strong><span>Median · ${s.confirmed} eligible confirmed</span></div>
        <div><strong>${s.spread_s == null ? "—" : `${s.spread_s.toFixed(3)} s`}</strong><span>Confirmed time spread</span></div>
      </div>${progress ? `<p>${esc(progress.text)}</p>` : '<p class="st-quiet">No earlier recorded best in this driver’s same car and PI.</p>'}
      <div class="st-debrief-grid"><div><h3>A against B · measured</h3>
        ${pair?.difference_s != null ? `<p>A is ${Math.abs(pair.difference_s).toFixed(3)} s ${pair.difference_s > 0 ? "quicker" : pair.difference_s < 0 ? "slower" : "equal"} in recorded time${[pair.a_finish,pair.b_finish].includes("last_packet") ? " · includes an estimate" : ""}.</p>
        <p class="st-quiet">A: ${pair.a_finish === "last_packet" ? "estimated finish" : "confirmed finish"}${pair.a_eligible ? "" : " · not eligible"} · B: ${pair.b_finish === "last_packet" ? "estimated finish" : "confirmed finish"}${pair.b_eligible ? "" : " · not eligible"}</p>` : ""}
        ${corners.length ? `<ul>${corners.slice(0,3).map(f => `<li>${esc(f.text)}</li>`).join("")}</ul>
        <p class="st-quiet">Corner numbering uses reference lap ${pair.reference_lap_id}; detection can change with a new reference.</p>` : '<p class="st-quiet">No dependable corner priorities for this selection.</p>'}
        ${compare ? `<a href="${compare}">Open traces and corners</a>` : ""}</div>
        <div><h3>${explanation ? "Gemini’s priorities" : "Optional AI debrief"}</h3>
          ${explanation ? `<ul>${explanation.highlights.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
          <h3>One practice focus · hypothesis</h3><p>${esc(explanation.focus)}</p><p>${esc(explanation.practice)}</p>` : ""}
          <p class="st-quiet st-debrief-status">${esc(status)}</p><div class="st-debrief-actions"><button type="button" data-debrief="generate" ${disabled ? "disabled" : ""}>${this.retry ? "Retry AI debrief" : "Generate AI debrief"}</button>
          <button type="button" data-debrief="refresh">Reload measurements</button></div>
          <p class="st-quiet">Generating one needs a signed-in SplitTime account · shared AI budget $1 / UTC month, up to $0.01 reserved per call · $${ai.budget.remaining_usd.toFixed(3)} left.</p></div></div>
      <p class="st-quiet">${s.estimated} estimated finishes · ${s.laps_runs - s.eligible} laps/runs not eligible. Event starts are counted separately above.</p>
      <ul class="st-quiet st-debrief-warnings">${report.warnings.map(w => `<li>${esc(w)}</li>`).join("")}</ul>`;
    }
  }
  globalThis.SessionDebrief = SessionDebrief;
})();
