"""Read-only statistics over the recorded index.

Everything here is derived from two things the rest of the app already
trusts: the session list and the rivalry projection (`app/rivalry.py`), which
is the one place that decides whether a lap counts. Nothing reads frames, so
the page stays cheap however long the history gets; frame-derived numbers
(top speed, air time) are a later addition and are not guessed at here.

The answer is a list of sections, each a list of tables, already in display
order. The page renders whatever it is given, so adding a statistic is a
change to this file only. Every table is keyed by driver id - any number of
drivers, never a pair.

Cell kinds: text, int, time (a lap time, seconds), duration (a long span,
seconds), pct (0..1), date (ISO UTC), gap (seconds, signed). A cell may also
be {"kind", "value", "est"}: `est` marks a time taken from the last packet, so
an estimated finish is never shown as if the game had confirmed it.

Comparisons between drivers are exploratory, exactly as on Rivalry: a shared
route fingerprint and car class do not prove the same direction, checkpoints
or timing rules. The response says so (`scoring`) and so does every table
that ranks one driver against another.
"""
from __future__ import annotations

import statistics
from collections import Counter, defaultdict
from datetime import datetime, timezone

from .rivalry import rivalry_summary

WEEKS_SHOWN = 12
CONSISTENCY_MIN_LAPS = 3
EXPLORATORY = ("Recorded times, exploratory: sharing a route and car class does not"
               " prove equal conditions, and the game's own verdict is not available.")


def _time(lap: dict | None) -> dict | None:
    """A lap time cell that keeps its provenance."""
    if lap is None:
        return None
    return {"kind": "time", "value": lap["time_s"],
            "est": lap.get("finish") == "last_packet"}


def _col(label: str, kind: str = "text") -> dict:
    return {"label": label, "kind": kind}


def _table(title: str, columns: list[dict], rows: list[list], note: str = "") -> dict:
    return {"title": title, "columns": columns, "rows": rows, "note": note}


def _when(iso: str | None) -> datetime | None:
    if not iso:
        return None
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


def _week(moment: datetime) -> str:
    year, week, _ = moment.isocalendar()
    return f"{year}-W{week:02d}"


def _per_driver(title: str, drivers: list[dict], rows: list[tuple[str, str, dict]],
                note: str = "") -> dict:
    """A table with one column per driver. rows: (label, kind, {driver: value})."""
    return {"title": title, "note": note, "per_driver": True,
            "columns": [_col("")] + [_col(d["name"]) for d in drivers],
            # a measure nobody has a number for yet is left out
            "rows": [[label] + [{"kind": kind, "value": values.get(d["id"])}
                                for d in drivers]
                     for label, kind, values in rows
                     if any(values.get(d["id"]) is not None for d in drivers)]}


# Achievements: a rule table over numbers computed below. (id, title, what it
# takes, which number, target). Goals are simply the ones not yet reached.
ACHIEVEMENTS = (
    ("first_lap", "On the board", "Record a valid lap", "valid_laps", 1),
    ("laps_10", "Getting warm", "10 valid laps", "valid_laps", 10),
    ("laps_50", "Regular", "50 valid laps", "valid_laps", 50),
    ("laps_200", "Lives here", "200 valid laps", "valid_laps", 200),
    ("routes_5", "Tourist", "Valid lap on 5 routes", "routes_valid", 5),
    ("routes_15", "Local guide", "Valid lap on 15 routes", "routes_valid", 15),
    ("classes_3", "Class hopper", "Valid lap in 3 car classes", "classes", 3),
    ("cars_5", "Collector", "Valid lap in 5 different cars", "cars", 5),
    ("streak_5", "Clean sheet", "5 valid laps in a row", "clean_streak", 5),
    ("streak_15", "Untouchable", "15 valid laps in a row", "clean_streak", 15),
    ("hour", "Seat time", "1 hour of timed laps", "lap_seconds", 3600),
    ("hours_10", "Endurance", "10 hours of timed laps", "lap_seconds", 36000),
    ("pb_10", "Always improving", "Beat your own best 10 times", "improvements", 10),
    ("held_1", "Record holder", "Hold a best that another driver has contested",
     "contested_held", 1),
    ("held_5", "Hard to beat", "Hold 5 contested bests", "contested_held", 5),
    ("sprint", "Point to point", "Finish a valid sprint run", "sprint_valid", 1),
)


def stats_summary(store, configured_drivers=()) -> dict:
    rivalry = rivalry_summary(store, configured_drivers)
    sessions = store.list_sessions()
    names = {d["id"]: d["name"] for d in rivalry["drivers"]}
    for cat in rivalry["categories"]:
        for lap in cat["attempts"]:
            names.setdefault(lap["driver_id"], lap["driver_name"])
    for s in sessions:
        names.setdefault(s.get("driver_id") or "legacy",
                         s.get("driver_name") or s.get("driver_id") or "legacy")
    drivers = [{"id": i, "name": n} for i, n in names.items()]
    ids = [d["id"] for d in drivers]

    kinds = {s["route_id"]: s.get("route_kind") for s in sessions}
    laps = []                     # every attempt, with its category attached
    for cat in rivalry["categories"]:
        for lap in cat["attempts"]:
            laps.append({**lap, "route_id": cat["route_id"],
                         "route_name": cat["route_name"],
                         "class_label": cat["car_class_label"],
                         "cat": (cat["route_id"], cat["car_class"],
                                 cat["route_name"])})
    timed = [lap for lap in laps if lap["time_s"]]
    valid = [lap for lap in timed if lap["candidate_clean"]]

    def by_driver(rows, value=lambda rows: len(rows)):
        grouped = defaultdict(list)
        for row in rows:
            grouped[row["driver_id"]].append(row)
        return {i: value(grouped[i]) for i in ids if grouped[i]}

    # -- totals ------------------------------------------------------------
    sess_by = defaultdict(list)
    for s in sessions:
        sess_by[s.get("driver_id") or "legacy"].append(s)
    recorded = {i: sum(max(0.0, (s["ended_at"] or s["started_at"]) - s["started_at"])
                       for s in rows) for i, rows in sess_by.items()}
    lap_seconds = by_driver(timed, lambda rows: sum(r["time_s"] for r in rows))
    # imported sessions have no route, car or class: unknown is not "one more"
    def known(field, unknown=None):
        return lambda rows: len({r[field] for r in rows if r[field] != unknown})
    routes_valid = by_driver(valid, known("route_id"))
    cars = by_driver(valid, known("car_ordinal"))
    classes = by_driver(valid, known("class_label", "?"))
    stamps = [w for w in (_when(lap["finished_at_utc"] or lap["started_at_utc"])
                          for lap in laps) if w]

    overview = _per_driver("Totals", drivers, [
        ("Sessions recorded", "int", {i: len(r) for i, r in sess_by.items()}),
        ("Timed laps and runs", "int", by_driver(timed)),
        ("Valid laps and runs", "int", by_driver(valid)),
        ("Routes with a valid time", "int", routes_valid),
        ("Cars with a valid time", "int", cars),
        ("Time recorded", "duration", recorded),
        ("Time in timed laps", "duration", lap_seconds),
    ], note="Time recorded is the length of every kept session, start to end."
            " Time in timed laps adds up the lap and run times themselves.")

    # -- bests and the leaderboard ------------------------------------------
    cat_best: dict[tuple, dict] = defaultdict(dict)
    for lap in valid:
        best = cat_best[lap["cat"]]
        if lap["driver_id"] not in best or lap["time_s"] < best[lap["driver_id"]]["time_s"]:
            best[lap["driver_id"]] = lap
    held, contested_held, uncontested = Counter(), Counter(), Counter()
    wins = defaultdict(Counter)   # wins[a][b]: categories where a is ahead of b
    gaps = []                     # (gap, leader lap, second lap, category)
    tied = set()                  # categories whose fastest time is shared
    for cat, best in cat_best.items():
        order = sorted(best.values(), key=lambda lap: lap["time_s"])
        if len(order) == 1:
            held[order[0]["driver_id"]] += 1
            uncontested[order[0]["driver_id"]] += 1
            continue
        gaps.append((order[1]["time_s"] - order[0]["time_s"], order[0], order[1], cat))
        # an identical time is a tie: nobody holds the best or wins the pair
        if order[0]["time_s"] == order[1]["time_s"]:
            tied.add(cat)
        else:
            held[order[0]["driver_id"]] += 1
            contested_held[order[0]["driver_id"]] += 1
        for i, ahead in enumerate(order):
            for behind in order[i + 1:]:
                if ahead["time_s"] < behind["time_s"]:
                    wins[ahead["driver_id"]][behind["driver_id"]] += 1
    contested = sum(1 for best in cat_best.values() if len(best) > 1)

    board = _table("Leaderboard", [
        _col("Driver"), _col("Bests held", "int"), _col("Contested", "int"),
        _col("Unopposed", "int"), _col("Valid laps", "int"),
        _col("Routes", "int")],
        sorted(([names[i], held[i], contested_held[i], uncontested[i],
                 by_driver(valid).get(i, 0), routes_valid.get(i, 0)] for i in ids),
               key=lambda row: (-row[2], -row[1], -row[4])),
        note="A best is the fastest valid time on one route in one car class."
             " Contested means another driver also has a valid time there; an"
             " identical time is a tie and counts for nobody."
             f" {contested} of {len(cat_best)} route and class pairs are contested. "
             + EXPLORATORY)
    by_measure = _per_driver("Other ways to rank", drivers, [
        ("Bests held", "int", dict(held)),
        ("Contested bests held", "int", dict(contested_held)),
        ("Valid laps", "int", by_driver(valid)),
        ("Routes with a valid time", "int", routes_valid),
        ("Share of laps valid", "pct",
         {i: by_driver(valid).get(i, 0) / n for i, n in by_driver(timed).items()}),
        ("Time in timed laps", "duration", lap_seconds),
    ])
    all_bests = _table("Every best: route and class", [
        _col("Route"), _col("Class")] + [_col(d["name"], "time") for d in drivers]
        + [_col("Fastest recorded"), _col("Gap", "gap")],
        [[cat[2], next(iter(best.values()))["class_label"]]
         + [_time(best.get(i)) for i in ids]
         + (lambda order: ["Tie" if cat in tied else order[0]["driver_name"],
                           order[1]["time_s"] - order[0]["time_s"]
                           if len(order) > 1 else None])(
             sorted(best.values(), key=lambda lap: lap["time_s"]))
         for cat, best in sorted(cat_best.items(), key=lambda kv: kv[0][2].lower())],
        note="“est.” marks a time taken from the last packet because the game stopped"
             " sending at the finish line. " + EXPLORATORY)

    # -- head to head --------------------------------------------------------
    pairs = [[names[a], names[b], wins[a][b], wins[b][a]]
             for n, a in enumerate(ids) for b in ids[n + 1:]
             if wins[a][b] or wins[b][a]]
    h2h_tables = [_table("Record between drivers", [
        _col("Driver"), _col("Driver"), _col("Ahead", "int"), _col("Behind", "int")],
        pairs, note="Counted over route and class pairs where both have a valid time;"
                    " identical times count for neither. " + EXPLORATORY)]
    if gaps:
        gaps.sort(key=lambda row: row[0])
        def gap_row(row):
            return [row[3][2], row[1]["class_label"], row[1]["driver_name"],
                    row[2]["driver_name"], row[0]]
        h2h_tables.append(_table("Closest and widest", [
            _col("Route"), _col("Class"), _col("Fastest recorded"), _col("Next"),
            _col("Gap", "gap")],
            [gap_row(gaps[0])] + ([gap_row(gaps[-1])] if len(gaps) > 1 else [])))

    # -- clean driving -------------------------------------------------------
    def flagged(name):
        return by_driver([lap for lap in timed if name in lap["flags"]])
    streak = {}
    for i in ids:
        run = longest = 0
        mine = sorted((lap for lap in timed if lap["driver_id"] == i),
                      key=lambda lap: (lap["started_at_utc"] or "", lap["lap_id"]))
        for lap in mine:
            run = run + 1 if lap["candidate_clean"] else 0
            longest = max(longest, run)
        if mine:
            streak[i] = longest
    clean = _per_driver("Clean driving", drivers, [
        ("Valid laps", "int", by_driver(valid)),
        ("Share of laps valid", "pct",
         {i: by_driver(valid).get(i, 0) / n for i, n in by_driver(timed).items()}),
        ("Laps with contact", "int", flagged("contact")),
        ("Laps with a rewind", "int", flagged("rewind")),
        ("Longest run of valid laps", "int", streak),
        ("Laps excluded by hand", "int",
         by_driver([lap for lap in timed if lap["validity"] == "excluded"])),
    ], note="Contact and rewind are read from the telemetry; the game does not"
            " send its own verdict.")

    # -- consistency ---------------------------------------------------------
    spread_rows = []
    for (cat, driver), rows in _group(valid, lambda lap: (lap["cat"], lap["driver_id"])).items():
        if len(rows) < CONSISTENCY_MIN_LAPS:
            continue
        times = sorted(r["time_s"] for r in rows)
        spread_rows.append([cat[2], rows[0]["class_label"], names[driver], len(times),
                            _time(min(rows, key=lambda r: r["time_s"])),
                            statistics.median(times),
                            statistics.median(times) - times[0],
                            statistics.pstdev(times)])
    spread_rows.sort(key=lambda row: row[7])
    consistency = _table("Spread of valid laps", [
        _col("Route"), _col("Class"), _col("Driver"), _col("Laps", "int"),
        _col("Best", "time"), _col("Typical", "time"),
        _col("Typical off best", "gap"), _col("Spread", "gap")],
        spread_rows,
        note=f"Routes with at least {CONSISTENCY_MIN_LAPS} valid laps by one driver in"
             " one class, most consistent first. Typical is the median; spread is the"
             " standard deviation.")

    # -- improvement ---------------------------------------------------------
    improvements, biggest = Counter(), []
    for (cat, driver), rows in _group(valid, lambda lap: (lap["cat"], lap["driver_id"])).items():
        rows = sorted(rows, key=lambda lap: (lap["finished_at_utc"] or "", lap["lap_id"]))
        best = first = None
        for lap in rows:
            if best is None:
                best = first = lap
            elif lap["time_s"] < best["time_s"]:
                best = lap
                improvements[driver] += 1
        if first is not None and best["time_s"] < first["time_s"]:
            biggest.append([cat[2], rows[0]["class_label"], names[driver],
                            _time(first), _time(best),
                            first["time_s"] - best["time_s"]])
    biggest.sort(key=lambda row: -row[5])
    improvement = [
        _per_driver("Beating your own best", drivers, [
            ("Times a best was beaten", "int", dict(improvements))]),
        _table("Most time found on a route", [
            _col("Route"), _col("Class"), _col("Driver"), _col("First valid", "time"),
            _col("Best", "time"), _col("Found", "gap")], biggest[:10]),
    ]

    # -- routes --------------------------------------------------------------
    route_rows = []
    for route, rows in _group(timed, lambda lap: (lap["route_id"], lap["route_name"])).items():
        per = Counter(r["driver_id"] for r in rows)
        ok = [r for r in rows if r["candidate_clean"]]
        route_rows.append([route[1], (kinds.get(route[0]) or "?"), len(rows), len(ok)]
                          + [per.get(i, 0) for i in ids]
                          + [_time(min(ok, key=lambda r: r["time_s"], default=None))])
    route_rows.sort(key=lambda row: -row[2])
    routes = [_table("Most driven routes", [
        _col("Route"), _col("Kind"), _col("Laps", "int"), _col("Valid", "int")]
        + [_col(d["name"], "int") for d in drivers] + [_col("Fastest valid", "time")],
        route_rows),
        _per_driver("Circuits and sprints", drivers, [
            ("Circuit laps", "int", by_driver(
                [lap for lap in timed if kinds.get(lap["route_id"]) == "circuit"])),
            ("Sprint runs", "int", by_driver(
                [lap for lap in timed if kinds.get(lap["route_id"]) == "sprint"])),
        ])]

    # -- cars ----------------------------------------------------------------
    car_rows = []
    for (driver, car, label), rows in _group(
            timed, lambda lap: (lap["driver_id"], lap["car_name"], lap["class_label"])).items():
        ok = [r for r in rows if r["candidate_clean"]]
        car_rows.append([names[driver], car, label, len(rows), len(ok),
                         sum(r["time_s"] for r in rows),
                         sum(1 for best in cat_best.values()
                             if min(best.values(), key=lambda lap: lap["time_s"])
                             in ok)])
    car_rows.sort(key=lambda row: -row[3])
    cars_section = [
        _table("Cars", [_col("Driver"), _col("Car"), _col("Class"), _col("Laps", "int"),
                        _col("Valid", "int"), _col("Time in laps", "duration"),
                        _col("Bests held", "int")], car_rows),
        _per_driver("Variety", drivers, [
            ("Cars with a valid time", "int", cars),
            ("Car classes with a valid time", "int", classes)]),
    ]

    # -- activity ------------------------------------------------------------
    weeks: dict[str, dict] = defaultdict(lambda: defaultdict(lambda: [0, 0, 0.0]))
    days = defaultdict(set)
    for s in sessions:
        moment = datetime.fromtimestamp(s["started_at"], timezone.utc)
        cell = weeks[_week(moment)][s.get("driver_id") or "legacy"]
        cell[0] += 1
        cell[1] += s.get("lap_count") or 0
        cell[2] += max(0.0, (s["ended_at"] or s["started_at"]) - s["started_at"])
        days[s.get("driver_id") or "legacy"].add(moment.date())
    week_rows = [[week] + [v for i in ids for v in weeks[week].get(i, [0, 0, 0.0])]
                 for week in sorted(weeks, reverse=True)[:WEEKS_SHOWN]]
    activity = [
        _table("By week", [_col("Week")] + [
            _col(f"{d['name']} · {what}", kind) for d in drivers
            for what, kind in (("sessions", "int"), ("laps", "int"), ("time", "duration"))],
            week_rows, note=f"Weeks start on Monday (UTC). Latest {WEEKS_SHOWN} shown."),
        _per_driver("Habits", drivers, [
            ("Days with a recording", "int", {i: len(v) for i, v in days.items()}),
            ("Sessions per active day", "text",
             {i: f"{len(sess_by[i]) / len(v):.1f}" for i, v in days.items() if v}),
            ("Weeks with a recording", "int",
             {i: sum(1 for w in weeks.values() if i in w) for i in ids
              if any(i in w for w in weeks.values())}),
        ]),
    ]

    # -- events and conditions ----------------------------------------------
    mode_label = {"race": "Race (guess)", "rivals": "Rivals (guess)", "unknown": "Unknown"}
    modes = _group(timed, lambda lap: mode_label.get(lap["event_mode"], "Unknown"))
    surfaces = _group(sessions, lambda s: s.get("track_type") or "not tagged")
    events = [
        _table("Kind of event", [_col("Mode")] + [_col(d["name"], "int") for d in drivers],
               [[mode] + [sum(1 for r in rows if r["driver_id"] == i) for i in ids]
                for mode, rows in sorted(modes.items())],
               note="The game does not say which mode an event is. This is a guess"
                    " from the telemetry and is not yet used to separate bests."),
        _table("Surface", [_col("Tag")] + [_col(d["name"], "int") for d in drivers],
               [[tag] + [sum(1 for s in rows if (s.get("driver_id") or "legacy") == i)
                         for i in ids] for tag, rows in sorted(surfaces.items())],
               note="Sessions by surface tag."),
        _table("Weather", [_col("Conditions")] + [_col(d["name"], "int") for d in drivers],
               [[tag] + [sum(1 for s in rows if (s.get("driver_id") or "legacy") == i)
                         for i in ids]
                for tag, rows in sorted(_group(
                    sessions, lambda s: s.get("conditions") or "not tagged").items())],
               note="Sessions by conditions tag (dry, wet, snow), set by hand or"
                    " detected for wet."),
    ]

    # -- goals and achievements ---------------------------------------------
    numbers = {"valid_laps": by_driver(valid), "routes_valid": routes_valid,
               "classes": classes, "cars": cars, "clean_streak": streak,
               "lap_seconds": lap_seconds, "improvements": dict(improvements),
               "contested_held": dict(contested_held),
               "sprint_valid": by_driver(
                   [lap for lap in valid if kinds.get(lap["route_id"]) == "sprint"])}
    earned_rows, goal_rows = [], []
    for _id, title, what, number, target in ACHIEVEMENTS:
        have = {i: numbers[number].get(i, 0) for i in ids}
        earned_rows.append([title, what] + ["Earned" if have[i] >= target else "—"
                                            for i in ids])
        for i in ids:
            if have[i] < target:
                goal_rows.append([names[i], title, what,
                                  _progress(number, have[i], target), have[i] / target])
    # each driver's nearest few goals, closest first
    goal_rows.sort(key=lambda row: -row[4])
    seen, nearest = Counter(), []
    for row in goal_rows:
        if seen[row[0]] < 4:
            seen[row[0]] += 1
            nearest.append(row[:4])
    goals = [
        _table("Next goals", [_col("Driver"), _col("Goal"), _col("What it takes"),
                              _col("Progress")], nearest,
               note="The four closest unearned achievements for each driver."),
        _table("Achievements", [_col("Achievement"), _col("What it takes")]
               + [_col(d["name"]) for d in drivers], earned_rows),
    ]

    # -- attempts: every start, finished or given up ---------------------------
    started = rivalry["route_attempts"]
    def per(field):
        return {i: c[field] for i, c in started["drivers"].items()}
    rate = {i: c["finished"] / c["attempts"]
            for i, c in started["drivers"].items() if c["attempts"]}
    attempts = [
        _per_driver("Events started", drivers, [
            ("Attempts", "int", per("attempts")),
            ("Finished", "int", per("finished")),
            ("Given up", "int", per("abandoned")),
            ("Finish rate", "pct", rate),
        ], note="An attempt is one started event. Finished means it produced at"
                " least one timed lap or run. Attempts given up are counted from"
                " the day this was added; earlier ones were not recorded."),
        _table("Attempts by route", [_col("Route")] + [
            _col(f"{d['name']} · {label}", "int")
            for d in drivers for label in ("attempts", "finished")],
            [[r["route_name"]] + [
                {"kind": "int", "value": r["drivers"].get(d["id"], {}).get(field)}
                for d in drivers for field in ("attempts", "finished")]
             for r in started["routes"]],
            note="A given-up attempt is matched to a route by where it started."
                 " Where two routes share a start line, or the place matches no"
                 " known course, it is listed under Unknown route."),
    ]

    sections = [
        ("overview", "Overview", [overview]),
        ("attempts", "Attempts", attempts),
        ("leaderboard", "Leaderboard", [board, by_measure]),
        ("bests", "Best times", [all_bests]),
        ("head_to_head", "Head to head", h2h_tables),
        ("clean", "Clean driving", [clean]),
        ("consistency", "Consistency", [consistency]),
        ("improvement", "Improvement", improvement),
        ("routes", "Routes", routes),
        ("cars", "Cars", cars_section),
        ("activity", "Activity", activity),
        ("events", "Events and conditions", events),
        ("goals", "Goals and achievements", goals),
    ]
    return {
        "version": 1,
        # same standing as Rivalry: nothing here is an official result
        "scoring": rivalry["scoring"],
        "drivers": drivers,
        "span": {"first_utc": min(stamps).isoformat().replace("+00:00", "Z") if stamps else None,
                 "last_utc": max(stamps).isoformat().replace("+00:00", "Z") if stamps else None},
        "totals": {"sessions": len(sessions), "laps": len(timed), "valid": len(valid),
                   "routes": len({lap["route_id"] for lap in timed})},
        "sections": [{"id": sid, "title": title,
                      # no drivers at all: nothing recorded, nothing to show
                      "tables": [t for t in tables if t["rows"] and drivers]}
                     for sid, title, tables in sections],
    }


def _group(rows, key) -> dict:
    out = defaultdict(list)
    for row in rows:
        out[key(row)].append(row)
    return out


def _progress(number: str, have: float, target: float) -> str:
    if number == "lap_seconds":
        return f"{have / 60:.0f} of {target / 60:.0f} min"
    return f"{have:g} of {target:g}"
