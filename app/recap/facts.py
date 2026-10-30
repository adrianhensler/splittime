"""The week in SplitTime (ADR 35): measured facts for one Monday-to-Sunday week.

Everything is read from the rivalry projection (app/rivalry.py), so a lap
counts here exactly as it does on Rivalry and Stats, and nothing reads frames.
A week runs from Monday 00:00 to the next Monday 00:00 in the drivers' time
zone (RECAP_TZ, default America/Halifax); a lap belongs to the week it
finished in, and a lap still being recorded (no finish yet) is in no week
until it finishes, so it can never move a finished week's facts.

Driver and route names go to the writer as written, and its output stores them
as placeholders ({D1}, {R1}, ...), as the race report does with gamertags. No
dates or other numbers that are not measured facts are sent: every number in
the facts is one the recap may state.
"""
from __future__ import annotations

import hashlib
import json
import os
from collections import Counter
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from ..racereport.auto import _stamp, takeovers

REPORT_VERSION = 2  # 2: within reach
MAX_BESTS = 8
MAX_REACH = 3  # per driver
MAX_WEEKS = 12


def zone():
    return ZoneInfo(os.environ.get("RECAP_TZ", "America/Halifax"))


def monday_of(moment: float) -> date:
    day = datetime.fromtimestamp(moment, zone()).date()
    return day - timedelta(days=day.weekday())


def bounds(monday: date) -> tuple[float, float]:
    """Start and end of a week as timestamps; a DST change makes it 167 or 169 hours."""
    tz = zone()
    return (datetime.combine(monday, time(0), tz).timestamp(),
            datetime.combine(monday + timedelta(days=7), time(0), tz).timestamp())


def _laps(summary):
    """(finish time, category key, category, lap) for every finished lap."""
    out = []
    for group in summary["categories"]:
        key = (group["route_id"], group["car_class"], group["route_name"])
        for lap in group["attempts"]:
            moment = _stamp(lap.get("finished_at_utc"))
            if moment is not None:
                out.append((moment, key, group, lap))
    return out


def _route(key):
    """A route whatever the class, as Stats counts routes; unidentified ones by name."""
    return key[0] if key[0] is not None else key[2]


def weeks(summary, now: float) -> list[date]:
    """Mondays of the weeks with a recorded lap, newest first."""
    return sorted({monday_of(t) for t, *_ in _laps(summary) if t <= now}, reverse=True)[:MAX_WEEKS]


def _estimated(lap):
    """Time provenance (AGENTS.md): the game stopped sending at the line, so
    the time is SplitTime's last clock reading, not the game's own."""
    return lap.get("finish") == "last_packet"


def _records(laps, cutoff):
    """Each contested category's record lap and every other driver's best, at
    `cutoff`: categories two or more drivers have a clean time on, with one
    outright fastest (a tie is held by nobody)."""
    best: dict = {}
    for t, key, _, lap in laps:
        if t < cutoff and lap.get("candidate_clean"):
            mine = best.setdefault(key, {})
            if lap["driver_id"] not in mine or lap["time_s"] < mine[lap["driver_id"]]["time_s"]:
                mine[lap["driver_id"]] = lap
    out = {}
    for key, times in best.items():
        if len(times) < 2:
            continue
        ranked = sorted(times.values(), key=lambda lap: lap["time_s"])
        out[key] = (ranked[0] if ranked[0]["time_s"] < ranked[1]["time_s"] else None, ranked)
    return out


def _holders(laps, cutoff):
    """Outright record holders among drivers, on routes two or more have a clean time on."""
    records = _records(laps, cutoff)
    held = Counter(record["driver_id"] for record, _ in records.values() if record)
    return held, len(records)


def _reach(laps, end, names, route):
    """Within reach: for each driver, the records someone else holds at the
    week's end that their own best is closest to. The pair goes with each, so
    the page can open its race report: where the gap is, section by section."""
    entries = []
    for key, (record, ranked) in _records(laps, end).items():
        if record is None:
            continue
        for lap in ranked[1:]:
            entries.append(({"driver": names[lap["driver_id"]], "route": route[key][0],
                             "class": route[key][1], "holder": names[record["driver_id"]],
                             "time_s": lap["time_s"], "estimated_finish": _estimated(lap),
                             "record_time_s": record["time_s"], "record_estimated_finish": _estimated(record),
                             "gap_s": round(lap["time_s"] - record["time_s"], 3)},
                            [lap["lap_id"], record["lap_id"]]))
    entries.sort(key=lambda e: (e[0]["gap_s"], e[0]["route"].casefold(), e[0]["route"],
                                str(e[0]["class"]), e[0]["driver"].casefold(), e[1]))
    kept, count = [], Counter()
    for entry in entries:
        if count[entry[0]["driver"]] < MAX_REACH:
            count[entry[0]["driver"]] += 1
            kept.append(entry)
    return [e for e, _ in kept], [pair for _, pair in kept]


def build(summary, monday: date, now: float) -> dict:
    start, end = bounds(monday)
    laps = _laps(summary)
    week = [item for item in laps if start <= item[0] < end]
    names = {lap["driver_id"]: lap["driver_name"] for *_, lap in laps}
    route = {key: (group["route_name"], group["car_class_label"]) for _, key, group, _ in laps}
    held_before, _ = _holders(laps, start)
    held_after, contested = _holders(laps, end)

    bests, per_route = [], Counter()
    for key in {key for _, key, _, _ in week}:
        for driver in {lap["driver_id"] for _, k, _, lap in week if k == key}:
            clean = [(t, lap) for t, k, _, lap in laps
                     if k == key and lap["driver_id"] == driver and lap.get("candidate_clean") and t < end]
            before = min((lap for t, lap in clean if t < start), key=lambda lap: lap["time_s"], default=None)
            during = min((lap for t, lap in clean if t >= start), key=lambda lap: lap["time_s"], default=None)
            if during and (not before or during["time_s"] < before["time_s"]):
                entry = {"driver": names[driver], "route": route[key][0], "class": route[key][1],
                         "time_s": during["time_s"], "estimated_finish": _estimated(during)}
                if before:
                    entry["previous_time_s"] = before["time_s"]
                    entry["previous_estimated_finish"] = _estimated(before)
                    entry["improved_s"] = round(before["time_s"] - during["time_s"], 3)
                bests.append(entry)
    for _, key, _, _ in week:
        per_route[key] += 1
    # a total order: the facts, and so the fingerprint, never depend on set or hash order
    bests.sort(key=lambda b: (-b.get("improved_s", -1), b["route"].casefold(), b["route"],
                              str(b["class"]), b["driver"].casefold(), b["time_s"]))

    # only what existed by the week's end, so a later route or driver never
    # changes a finished week (its fingerprint, and so its cached recap)
    drivers = []
    for driver in sorted({lap["driver_id"] for t, *_, lap in laps if t < end}, key=lambda d: names[d].casefold()):
        mine = [item for item in week if item[3]["driver_id"] == driver]
        first_seen = {}  # by route, not class: another class on a known route is not new
        for t, key, _, lap in laps:
            if lap["driver_id"] == driver:
                first_seen[_route(key)] = min(t, first_seen.get(_route(key), t))
        drivers.append({
            "driver": names[driver],
            "laps": len(mine),
            "clean_laps": sum(1 for *_, lap in mine if lap.get("candidate_clean")),
            "sessions": len({lap["session_id"] for *_, lap in mine}),
            "routes": len({_route(key) for _, key, _, _ in mine}),
            "new_routes": sum(1 for t in first_seen.values() if start <= t < end),
            "personal_bests": sum(1 for b in bests if b["driver"] == names[driver]),
            "records_held_before": held_before[driver],
            "records_held": held_after[driver],
        })

    by_lap = {lap["lap_id"]: (key, lap) for _, key, _, lap in laps}
    changed = []
    for new, old, moment, _ in takeovers(summary, start):
        if moment < end and new in by_lap and old in by_lap:
            (key, lap), (_, beaten) = by_lap[new], by_lap[old]
            changed.append({"route": route[key][0], "class": route[key][1],
                            "new_holder": names[lap["driver_id"]], "previous_holder": names[beaten["driver_id"]],
                            "time_s": lap["time_s"], "estimated_finish": _estimated(lap),
                            "previous_estimated_finish": _estimated(beaten),
                            "margin_s": round(beaten["time_s"] - lap["time_s"], 3)})

    # most laps; a tie goes to the route first by name, then class
    busiest = min(per_route.items(), key=lambda item: (-item[1], route[item[0]][0].casefold(),
                                                       str(route[item[0]][1]), str(item[0])), default=None)
    facts = {
        "laps": len(week),
        "clean_laps": sum(1 for *_, lap in week if lap.get("candidate_clean")),
        "sessions": len({lap["session_id"] for *_, lap in week}),
        "routes": len({_route(key) for key in per_route}),
        "contested_routes": contested,
        "drivers": drivers,
        "personal_bests": bests[:MAX_BESTS],
        "records_changed": changed,
        "busiest_route": ({"route": route[busiest[0]][0], "class": route[busiest[0]][1], "laps": busiest[1]}
                          if busiest else None),
    }
    # the page turns placeholders back into names after escaping
    tags = {f"D{n}": d["driver"] for n, d in enumerate(drivers, 1)}
    mentioned = {item["route"] for item in bests[:MAX_BESTS] + changed}
    mentioned |= {facts["busiest_route"]["route"]} if busiest else set()
    tags.update({f"R{n}": name for n, name in enumerate(sorted(mentioned, key=str.casefold), 1)})
    sunday = monday + timedelta(days=6)
    report = {"version": 1, "week": monday.isoformat(), "last_day": sunday.isoformat(),
              "complete": now >= end, "tags": tags, "facts": facts}
    # a column written before within reach existed is moved to this week's new
    # key rather than paid for again (api.adopt), as race reports were (ADR 33)
    legacy = _digest(report)

    reach, pairs = _reach(laps, end, names, route)
    facts["within_reach"] = reach
    # new routes are numbered after the ones above, so an adopted column's {R1}
    # still names the same route
    extra = sorted({item["route"] for item in reach} - mentioned, key=str.casefold)
    tags.update({f"R{n}": name for n, name in enumerate(extra, len(mentioned) + 1)})
    report["version"] = REPORT_VERSION
    report["reach_laps"] = pairs
    report["fingerprint"], report["legacy_fingerprint"] = _digest(report), legacy
    return report


def _digest(report):
    return hashlib.sha256(json.dumps(report, sort_keys=True, allow_nan=False).encode()).hexdigest()
