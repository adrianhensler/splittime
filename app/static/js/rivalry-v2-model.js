/* Read-only recorded history. No competitive-equivalence or game-validity claims.
   Which laps may be a best is decided once, on the server (app/rivalry.py):
   no rewind, no contact, not excluded; a last-packet time only when the
   whole route was covered. */
"use strict";
(function (root) {
  const timed = lap => Number.isFinite(lap.time_s) && lap.time_s > 0;
  const usable = lap => Number.isSafeInteger(lap.lap_id) && lap.lap_id > 0 &&
    timed(lap) && lap.completion !== "incomplete";
  const clean = lap => usable(lap) && lap.candidate_clean === true;
  // the game stopped sending at the line: the time is our last clock reading
  const estimated = lap => lap.finish === "last_packet";
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
  /* Every driver's best on one route, beyond the headline route + class:
     per car (within the route) and overall (any class, any car). */
  function routeBests(categories, routeId) {
    const overall = new Map(), cars = new Map();
    if (!Number.isSafeInteger(routeId)) return {overall, cars:[]};
    const faster = (lap, old) => !old || lap.time_s < old.time_s;
    for (const group of categories) if (group.route_id === routeId)
      for (const lap of group.attempts) if (clean(lap)) {
        const row = {...lap, car_class_label:group.car_class_label};
        if (faster(lap, overall.get(lap.driver_id))) overall.set(lap.driver_id, row);
        const k = JSON.stringify([lap.driver_id, lap.car_ordinal ?? lap.car_name]);
        if (faster(lap, cars.get(k))) cars.set(k, row);
      }
    return {overall, cars:[...cars.values()].sort((a,b) => a.time_s-b.time_s)};
  }
  /* Drivers with a best, fastest first: works for any number of drivers. */
  function standings(group) {
    return [...bests(group).values()].sort((a,b) => a.time_s-b.time_s ||
      (stamp(a) ?? Infinity)-(stamp(b) ?? Infinity));
  }
  /* What happened lately, newest first: every recorded improvement, read
     against the best the other drivers held at that moment. A takeover is
     any time the route record changes hands, including a first answer that
     beats the only time (timeline() marks a lead change only once both have
     a time); the rest say whether a lead grew, a gap closed or a time still
     waits for an answer. */
  function activity(categories, pair) {
    const events = [];
    for (const group of categories) {
      const laps = timeline(group, pair).filter(lap => lap.pb).sort((a,b) => stamp(a)-stamp(b));
      const best = new Map();
      for (const lap of laps) {
        const rival = [...best.values()].filter(old => old.driver_id !== lap.driver_id)
          .sort((a,b) => a.time_s-b.time_s)[0] || null;
        const record = [...best.values()].sort((a,b) => a.time_s-b.time_s)[0];
        const kind = !rival ? (lap.delta === null ? "first" : "unanswered") :
          lap.time_s >= rival.time_s ? "closing" :
          lap.lead || record.driver_id !== lap.driver_id ? "takeover" : "extended";
        events.push({kind, group, lap, rival, at:stamp(lap),
          margin:rival ? Math.abs(rival.time_s-lap.time_s) : null});
        best.set(lap.driver_id, lap);
      }
    }
    return events.sort((a,b) => b.at-a.at || b.lap.lap_id-a.lap.lap_id);
  }
  /* Route/class groups each driver leads, and those nobody else has run yet. */
  function scoreboard(categories, people) {
    const rows = new Map(people.map(d => [d.id, {id:d.id, name:d.name, leads:0, unanswered:0}]));
    let contested = 0;
    for (const group of categories) {
      const [first, second] = standings(group);
      const row = first && rows.get(first.driver_id);
      if (!row) continue;
      if (!second) {row.unanswered++; continue;}
      contested++;
      if (second.time_s > first.time_s) row.leads++;
    }
    return {contested, drivers:[...rows.values()]};
  }
  function ago(value, now = Date.now()) {
    const minutes = Math.max(0, Math.round((now-value)/60000));
    if (minutes < 60) return minutes <= 1 ? "just now" : `${minutes} min ago`;
    const hours = Math.round(minutes/60);
    return hours < 48 ? `${hours} h ago` : `${Math.round(hours/24)} days ago`;
  }
  function compare(a,b) {
    return usable(a || {}) && usable(b || {}) && a.lap_id !== b.lap_id ?
      `compare.html?lap_a=${a.lap_id}&lap_b=${b.lap_id}` : null;
  }
  const model = {timed, usable, clean, estimated, stamp, identity, key, time, date, drivers,
    bests, timeline, defaults, matches, visible, compare, routeBests, standings, activity,
    scoreboard, ago};
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  else root.RivalryModel = model;
})(globalThis);
