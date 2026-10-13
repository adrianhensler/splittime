"""How many times each driver started each route, finished or not.

Owner decision, 2026-10-13: a started event that ends with no timed lap or run
is still discarded, but drivers want their number of attempts. Every start
counts, however short ("ten attempts means ten attempts").

An attempt is one started event:

- finished: a kept session with at least one timed lap or run;
- abandoned: a row the recorder wrote to `attempts` as it gave the session up.

An abandoned attempt never had a lap to fingerprint, so its route is worked
out here from where it started: the one recorded route that starts within the
fingerprint's radius, else the one catalogue course that does, else unknown.
Two routes sharing a start line cannot be told apart this way and stay
unknown. Reads only; nothing here is an official result.
"""

from __future__ import annotations

import math
from collections import defaultdict

from . import tracks
from .recorder.store import ROUTE_START_RADIUS_M

UNKNOWN = "Unknown route"


def _near(x: float | None, z: float | None, places, sx: str, sz: str) -> list:
    if x is None or z is None:
        return []
    return [p for p in places
            if math.hypot(x - p[sx], z - p[sz]) <= ROUTE_START_RADIUS_M]


def route_of_start(x: float | None, z: float | None, routes: list[dict]) -> tuple:
    """(key, name) for an abandoned attempt's start position."""
    hit = _near(x, z, routes, "start_x", "start_z")
    if len(hit) == 1:
        route = hit[0]
        return route["id"], route.get("name") or f"Unnamed route #{route['id']}"
    if not hit:
        official = _near(x, z, list(tracks.TRACKS.values()), "start_x", "start_z")
        if len(official) == 1:
            return f"catalog:{official[0]['key']}", official[0]["name"]
    return None, UNKNOWN


def attempt_summary(store, sessions: list[dict] | None = None) -> dict:
    """{"drivers": {driver: counts}, "routes": [{route_id, route_name,
    drivers: {driver: counts}}], "names": {driver: name}} where counts is
    finished/abandoned/attempts."""
    sessions = store.list_sessions() if sessions is None else sessions
    lister = getattr(store, "list_attempts", None)
    abandoned = lister() if lister else []
    routes = store.route_starts() if abandoned else []

    per_route: dict[tuple, dict] = defaultdict(lambda: defaultdict(lambda: [0, 0]))
    # best_lap leaves out laps a person excluded; an excluded lap was still
    # driven, so ask for timed laps directly where the store can say
    timed = getattr(store, "timed_session_ids", None)
    finished_ids = (timed() & {s["id"] for s in sessions} if timed
                    else {s["id"] for s in sessions if s.get("best_lap")})
    names = {a["driver_id"]: a.get("driver_name") or a["driver_id"] for a in abandoned}
    for s in sessions:
        if s["id"] not in finished_ids:
            continue                    # no timed lap: not a finished attempt
        key = ((s["route_id"], s.get("route_name") or f"Unnamed route #{s['route_id']}")
               if s.get("route_id") is not None else (None, UNKNOWN))
        per_route[key][s.get("driver_id") or "legacy"][0] += 1
    for a in abandoned:
        if a["session_id"] in finished_ids:
            continue                    # since reprocessed into a timed session
        key = route_of_start(a["start_x"], a["start_z"], routes)
        per_route[key][a["driver_id"]][1] += 1

    def counts(pair):
        return {"finished": pair[0], "abandoned": pair[1], "attempts": pair[0] + pair[1]}

    totals: dict[str, list] = defaultdict(lambda: [0, 0])
    out = []
    for (route_id, name), drivers in per_route.items():
        for driver, pair in drivers.items():
            totals[driver][0] += pair[0]
            totals[driver][1] += pair[1]
        out.append({"route_id": route_id, "route_name": name,
                    "drivers": {d: counts(p) for d, p in drivers.items()}})
    out.sort(key=lambda r: (r["route_id"] is None, r["route_name"].lower()))
    return {"drivers": {d: counts(p) for d, p in totals.items()}, "routes": out,
            # for a driver known only from given-up attempts
            "names": names}
