"""Milestones and streaks (ADR 38): measured moments, dated, with no AI.

Read from the same finished laps as the weekly facts (facts._laps), so a lap
counts here as it does on Recap, Rivalry and Stats. Each milestone is dated by
the lap that reached it and so belongs to the week that lap finished in.
None of this goes to the AI column or into a week's fingerprint.

* a new route: a driver's first finished lap on a route, whatever the class;
* lap counts: a driver's 50th, 100th, 250th, 500th, 1000th finished lap, then
  every 1000th;
* personal bests in sessions running: three or more of a driver's sessions in
  a row each beat their own earlier valid best somewhere (a first time on a
  route and class beats nothing; a session with no finished lap is skipped);
* first time ahead: a driver's own valid lap makes them the outright fastest,
  for the first time, on a route and class someone else also has a valid
  time on (a tie is nobody's, as for records).
"""
from __future__ import annotations

from collections import defaultdict

from .facts import _estimated, _laps, _route

LAP_COUNTS = (50, 100, 250, 500, 1000)
STREAK = 3


def _count_reached(n: int) -> bool:
    return n in LAP_COUNTS or (n > LAP_COUNTS[-1] and n % 1000 == 0)


def find(summary) -> list[tuple[float, dict]]:
    """(finish time, milestone) for every milestone, oldest first."""
    laps = sorted(_laps(summary), key=lambda item: (item[0], item[3]["lap_id"]))
    names = {lap["driver_id"]: lap["driver_name"] for *_, lap in laps}
    out = []

    seen_routes, counts = defaultdict(set), defaultdict(int)
    for t, key, group, lap in laps:
        driver = lap["driver_id"]
        if _route(key) not in seen_routes[driver]:
            seen_routes[driver].add(_route(key))
            out.append((t, lap["lap_id"], {"kind": "new_route", "driver": names[driver], "route": group["route_name"]}))
        counts[driver] += 1
        if _count_reached(counts[driver]):
            out.append((t, lap["lap_id"], {"kind": "laps", "driver": names[driver], "count": counts[driver]}))

    # personal bests in sessions running; sessions in the order their first lap finished
    best, sessions = {}, defaultdict(dict)  # sessions[driver][session] = (time, lap) of its first PB, or None
    for t, key, _, lap in laps:
        mine = sessions[lap["driver_id"]].setdefault(lap["session_id"], None)
        if not lap.get("candidate_clean"):
            continue
        slot = (lap["driver_id"], key)
        if slot in best and lap["time_s"] < best[slot] and mine is None:
            sessions[lap["driver_id"]][lap["session_id"]] = (t, lap["lap_id"])
        best[slot] = min(lap["time_s"], best.get(slot, lap["time_s"]))
    for driver, mine in sessions.items():
        run = 0
        for pb in mine.values():  # dicts keep insertion order: the order sessions began
            run = run + 1 if pb is not None else 0
            if run >= STREAK:
                out.append((pb[0], pb[1], {"kind": "pb_streak", "driver": names[driver], "sessions": run}))

    # first time ahead, per route and class
    per_cat = defaultdict(list)
    for t, key, group, lap in laps:
        if lap.get("candidate_clean"):
            per_cat[key].append((t, group, lap))
    for key, rows in per_cat.items():
        bests, ahead = {}, set()
        for t, group, lap in rows:
            driver = lap["driver_id"]
            improved = driver not in bests or lap["time_s"] < bests[driver]["time_s"]
            if improved:
                bests[driver] = lap
            standing = sorted(bests.values(), key=lambda b: b["time_s"])
            if len(standing) < 2 or standing[0]["time_s"] == standing[1]["time_s"]:
                continue
            leader = standing[0]["driver_id"]
            if leader == driver and improved and leader not in ahead:
                out.append((t, lap["lap_id"], {"kind": "first_ahead", "driver": names[driver], "route": group["route_name"],
                                "class": group["car_class_label"], "time_s": lap["time_s"],
                                "estimated_finish": _estimated(lap), "over": names[standing[1]["driver_id"]],
                                "over_time_s": standing[1]["time_s"],
                                "over_estimated_finish": _estimated(standing[1]),
                                "margin_s": round(standing[1]["time_s"] - lap["time_s"], 3)}))
            ahead.add(leader)  # ahead already, if only because the other was slower
    # by the lap that reached each: two at one instant keep the order of their laps
    return [(t, m) for t, _, m in sorted(out, key=lambda item: item[:2])]


def for_week(found, start: float, end: float) -> list[dict]:
    return [m for t, m in found if start <= t < end]
