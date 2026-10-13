"""Read-only rivalry projection over LapScope's existing authoritative records.

Never fabricate competitive winners: the upstream route fingerprint, mode and
capture quality have not yet been verified for cross-driver scoring.

Which laps may be a driver's best (owner decision, 2026-10-13) - as close to
the game's own Rivals rule as the packet allows, since the game never sends
its verdict:

* a rewind or a contact disqualifies the lap (the effective flags, so a
  contact the driver dismissed as a false alarm no longer counts against it);
* an excluded lap never counts;
* a run timed from the last packet ("cutoff": the game stopped sending at the
  line and never reported a time) has to have covered the whole route, because
  a run abandoned at speed looks the same to the recorder. It counts only when
  it demonstrably went the distance, and is reported with
  `finish: "last_packet"` so the page can mark it.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone

from .cars import resolve_name

from .eventtype import guess_event
# The recorder applies the same full-route test before it times a gridded run
# (laps.py). It is applied here too: recordings made before that still hold
# last-packet times for runs that stopped short.
from .recorder.laps import FULL_ROUTE_MIN, FULL_ROUTE_UNITS  # noqa: F401
from .telemetry.packet import parse

_covered_cache: dict[tuple, float | None] = {}


def lap_covered(store, lap: dict) -> float | None:
    """Odometer distance a finished lap covered, from its last frame. None
    when it cannot be known (open lap, no frames, a store without frames)."""
    reader = getattr(store, "reader", None)
    end, start = lap.get("ended_t"), lap.get("start_distance")
    if reader is None or end is None or start is None:
        return None
    key = (getattr(store, "db_path", None), lap["id"], lap.get("started_t"), end)
    if key not in _covered_cache:
        with reader() as conn:
            row = conn.execute(
                "SELECT raw FROM frames WHERE session_id = ? AND t >= ? AND t <= ?"
                " ORDER BY t DESC LIMIT 1",
                (lap["session_id"], lap.get("started_t") or 0.0, end)).fetchone()
        _covered_cache[key] = (
            parse(row[0])["distance_traveled"] - start if row else None)
    return _covered_cache[key]

CLASS_LABELS = ("D", "C", "B", "A", "S1", "S2", "R", "X")


def _utc(t):
    if not isinstance(t, (int, float)) or not math.isfinite(t):
        return None
    return datetime.fromtimestamp(t, timezone.utc).isoformat().replace("+00:00", "Z")


def _lap_out(session: dict, lap: dict, names: dict, event: dict,
             covered: float | None = None) -> dict:
    raw_flags = lap.get("flags") or ""
    flags = sorted({item.strip() for item in raw_flags.split(",") if item.strip()})
    auto_flags = {item.strip() for item in (lap.get("flags_auto", raw_flags) or "").split(",")
                  if item.strip()}
    estimated = "cutoff" in auto_flags or "cutoff" in flags
    duration = lap.get("lap_time")
    timed = isinstance(duration, (int, float)) and math.isfinite(duration) and duration > 0
    completion = ("incomplete" if not timed else
                  "provisional" if estimated else "complete")
    # "cutoff" says how the time was obtained, not that the driving was
    # dirty; any other flag - known or from a detector added later - is
    validity = ("excluded" if lap.get("excluded") else
                "suspect" if set(flags) - {"cutoff"} else "accepted")
    full_route = None if covered is None else covered >= FULL_ROUTE_MIN
    # a last-packet time has to prove it went the distance. A time the game
    # itself reported is taken as a finished lap: the game does not report
    # one for a lap that was not completed.
    went_distance = full_route is True if estimated else True
    reason = (None if timed and validity == "accepted" and went_distance else
              "incomplete" if not timed else
              "excluded" if validity == "excluded" else
              next((f for f in ("rewind", "contact") if f in flags), None)
              or ("flagged" if validity == "suspect" else "route_not_completed"))
    driver_id = session.get("driver_id") or "legacy"
    ordinal = session.get("car_ordinal")
    return {
        "lap_id": lap["id"],
        "session_id": session["id"],
        "driver_id": driver_id,
        "driver_name": names.get(driver_id, driver_id),
        "started_at_utc": _utc(lap.get("started_t")),
        "finished_at_utc": _utc(lap.get("ended_t")),
        "car_ordinal": ordinal,
        "car_name": resolve_name(ordinal, session.get("car_name_override")),
        "car_pi": session.get("car_pi"),
        "car_class": session.get("car_class"),
        "lap_number": lap.get("lap_number"),
        "time_s": round(float(duration), 3) if timed else None,
        "completion": completion,
        "validity": validity,
        "capture_quality": "unknown",
        "timing_source": "cutoff_estimate" if estimated else "unverified",
        "finish": "last_packet" if estimated else "confirmed",
        "covered": None if covered is None else round(covered, 1),
        "full_route": full_route,
        "not_best_because": reason,
        # inferred, never reported by the game: see app/eventtype.py
        "event_mode": event["kind"],
        "event_mode_basis": event["basis"],
        "event_evidence": event["evidence"],
        "flags": flags,
        "flags_auto": sorted(auto_flags),
        "candidate_clean": reason is None,
    }


def rivalry_summary(store, configured_drivers=()) -> dict:
    """Generate a display projection; keep unknown routes isolated per session."""
    names = {d.id: d.name for d in configured_drivers}
    groups: dict[tuple, dict] = {}
    unresolved = 0
    for session in store.list_sessions():
        route_id, car_class = session.get("route_id"), session.get("car_class")
        if route_id is None:
            unresolved += 1
        # Never group two unidentified physical routes solely by their NULL ID.
        key = (route_id if route_id is not None else f"unknown-session-{session['id']}",
               car_class)
        group = groups.setdefault(key, {
            "route_id": route_id,
            "route_name": session.get("route_name") or (
                f"Unnamed route #{route_id}" if route_id is not None else
                f"Unidentified route · session {session['id']}"),
            "car_class": car_class,
            "car_class_label": (
                CLASS_LABELS[car_class] if isinstance(car_class, int)
                and 0 <= car_class < len(CLASS_LABELS) else "?"),
            "attempts": [],
        })
        event = guess_event(store, session)
        for lap in store.session_laps(session["id"]):
            group["attempts"].append(
                _lap_out(session, lap, names, event, lap_covered(store, lap)))

    categories = []
    for group in groups.values():
        group["attempts"].sort(
            key=lambda lap: (lap["started_at_utc"] or "", lap["lap_id"]), reverse=True)
        best = {}
        for lap in group["attempts"]:
            if not lap["candidate_clean"]:
                continue
            ident = lap["driver_id"]
            if ident not in best or lap["time_s"] < best[ident]["time_s"]:
                best[ident] = lap
        group["best_by_driver"] = {driver: {
            "lap_id": lap["lap_id"], "time_s": lap["time_s"],
            "car_pi": lap["car_pi"], "car_name": lap["car_name"],
            "finish": lap["finish"],
        } for driver, lap in best.items()}
        group["ranking_state"] = "exploratory"
        group["winner"] = None
        group["uncertainty"] = [
            "route_fingerprint_is_not_equivalence" if group["route_id"] is not None
            else "route_unidentified",
            "game_mode_is_a_guess",
            "capture_quality_unknown",
            "timing_provenance_unverified",
        ]
        group["total_attempts"] = len(group["attempts"])
        categories.append(group)
    categories.sort(key=lambda c: (
        c["route_name"].lower(),
        c["car_class"] if isinstance(c["car_class"], int) else -1))
    return {
        "version": 1,
        "source": "recorded_index",
        "scoring": "exploratory_only",
        "drivers": [{"id": d.id, "name": d.name} for d in configured_drivers],
        "unidentified_sessions": unresolved,
        "categories": categories,
    }
