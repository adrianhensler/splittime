/* Read-only recorded history. No competitive-equivalence or game-validity claims. */
"use strict";
(function (root) {
  const timed = lap => Number.isFinite(lap.time_s) && lap.time_s > 0;
  const usable = lap => Number.isSafeInteger(lap.lap_id) && lap.lap_id > 0 &&
    timed(lap) && lap.completion === "complete";
  const clean = lap => usable(lap) && lap.candidate_clean === true &&
    lap.validity === "accepted" && !(lap.flags || []).length &&
    !(lap.flags_auto || []).includes("cutoff");
  const stamp = lap => typeof lap.finished_at_utc === "string" &&
    Number.isFinite(Date.parse(lap.finished_at_utc)) ? Date.parse(lap.finished_at_utc) : null;
  const identity = lap => lap ? JSON.stringify([lap.lap_id, lap.session_id,
    lap.lap_number, lap.started_at_utc, lap.finished_at_utc, lap.time_s]) : null;
  const key = group => JSON.stringify([group.route_id ??
    `unknown-session-${group.attempts[0]?.session_id ?? group.route_name}`, group.car_class]);
  function time(value) {
    if (!Number.isFinite(value) || value <= 0) return "—";
    const ms = Math.round(value * 1000);
    return `${Math.floor(ms / 60000)}:${String(Math.floor(ms % 60000 / 1000)).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
  }
  function date(value, options = {}) {
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return "Unknown";
    return new Intl.DateTimeFormat(undefined, {year:"numeric", month:"short", day:"numeric",
      hour:"2-digit", minute:"2-digit", ...options}).format(new Date(value));
  }
  function drivers(data) {
    const result = new Map((data.drivers || []).map(d => [d.id, d]));
    for (const group of data.categories || []) for (const lap of group.attempts || []) {
      if (!result.has(lap.driver_id)) result.set(lap.driver_id,
        {id:lap.driver_id, name:lap.driver_name || lap.driver_id});
    }
    return [...result.values()];
  }
  function bests(group) {
    const result = new Map();
    for (const lap of group.attempts) if (clean(lap)) {
      const old = result.get(lap.driver_id);
      if (!old || lap.time_s < old.time_s || (lap.time_s === old.time_s &&
          (stamp(lap) ?? Infinity) < (stamp(old) ?? Infinity))) result.set(lap.driver_id, lap);
    }
    return result;
  }
  function timeline(group, pair) {
    const laps = group.attempts.map(lap => ({...lap, pb:false, delta:null, lead:false}));
    // An undated clean attempt could precede any dated record. Do not invent its order.
    const chronology = !laps.some(lap => clean(lap) && stamp(lap) === null);
    const dated = laps.filter(lap => stamp(lap) !== null).sort((a,b) => stamp(a)-stamp(b));
    const best = new Map();
    let leader = null;
    if (chronology) for (let i = 0; i < dated.length;) {
      let j = i + 1;
      while (j < dated.length && stamp(dated[j]) === stamp(dated[i])) j++;
      // Equal finish timestamps are one batch, never an arbitrary sequence of leads.
      const batch = new Map();
      for (let k = i; k < j; k++) {
        const lap = dated[k], other = batch.get(lap.driver_id);
        if (clean(lap) && (!other || lap.time_s < other.time_s)) batch.set(lap.driver_id,lap);
      }
      for (const lap of batch.values()) {
        const old = best.get(lap.driver_id);
        if (clean(lap) && (!old || lap.time_s < old.time_s)) {
          lap.pb = true; lap.delta = old ? old.time_s-lap.time_s : null;
          best.set(lap.driver_id, lap);
        }
      }
      const a = best.get(pair[0]?.id), b = best.get(pair[1]?.id);
      if (a && b) {
        const next = a.time_s === b.time_s ? "tie" : a.time_s < b.time_s ? a.driver_id : b.driver_id;
        if (leader !== null && leader !== next) {
          const changed = dated.slice(i,j).find(lap => lap.pb && lap.driver_id === next);
          if (changed) changed.lead = true;
        }
        leader = next;
      }
      i = j;
    }
    return laps.sort((a,b) => (stamp(b) ?? -Infinity)-(stamp(a) ?? -Infinity) || b.lap_id-a.lap_id);
  }
  function defaults(group, pair) {
    const best = bests(group), a = best.get(pair[0]?.id), b = best.get(pair[1]?.id);
    if (a && b) return [a.lap_id, b.lap_id];
    const own = a || b || [...best.values()][0];
    if (own) {
      const older = group.attempts.filter(lap => clean(lap) && lap.lap_id !== own.lap_id &&
        lap.driver_id === own.driver_id).sort((a,b) => (stamp(a) ?? Infinity)-(stamp(b) ?? Infinity));
      const other = older[0] || group.attempts.find(lap => usable(lap) && lap.lap_id !== own.lap_id);
      return [own.lap_id, other?.lap_id ?? null];
    }
    return group.attempts.filter(usable).slice(0,2).map(lap => lap.lap_id).concat([null,null]).slice(0,2);
  }
  function matches(group, lap, query) {
    const local = date(lap.finished_at_utc, {month:"2-digit",day:"2-digit"});
    const d = stamp(lap) === null ? null : new Date(lap.finished_at_utc);
    const localDay = d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}` : "";
    const text = [group.route_name, group.car_class_label, lap.driver_name, lap.car_name,
      lap.car_pi, ...(lap.flags || []), ...(lap.flags_auto || []), lap.completion,
      lap.validity, lap.event_mode, lap.finished_at_utc, lap.started_at_utc, local, localDay,
      date(lap.finished_at_utc), time(lap.time_s)].join(" ").toLowerCase();
    return query.trim().toLowerCase().split(/\s+/).every(term => text.includes(term));
  }
  function visible(group, query) {
    return group.attempts.length ? group.attempts.some(lap => matches(group,lap,query)) :
      `${group.route_name} ${group.car_class_label}`.toLowerCase().includes(query.trim().toLowerCase());
  }
  function compare(a,b) {
    return usable(a || {}) && usable(b || {}) && a.lap_id !== b.lap_id ?
      `compare.html?lap_a=${a.lap_id}&lap_b=${b.lap_id}` : null;
  }
  const model = {timed, usable, clean, stamp, identity, key, time, date, drivers,
    bests, timeline, defaults, matches, visible, compare};
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  else root.RivalryModel = model;
})(globalThis);
