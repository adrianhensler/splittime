"""Guess what kind of event a session was. The game does not say.

FH6's packet has no event-type or mode field, so this is inference from two
observations and is always reported as a guess:

* `race_position` above 1 at any point means another car was ahead, which
  cannot happen in Rivals (solo against a ghost).
* On the owner's Rivals capture of 2026-10-12 the lap clock ran during the
  approach from negative route distance and reset at the start line while the
  race clock kept counting. A race from a grid does not reset its lap clock
  at the line.

One capture supports the second rule. Treat "rivals" as "probably", and
"unknown" as the normal answer until more modes have been captured.
"""

from __future__ import annotations

from .telemetry.packet import empty_fields, pack, parse

APPROACH_SCAN_S = 30.0      # how far past the session start to look for the launch
APPROACH_SCAN_FRAMES = 6000
CLOCK_RESET_MIN_S = 0.5     # same size as the recorder's rewind threshold


def _byte_offset(field: str) -> int:
    base, probe = empty_fields(), empty_fields()
    probe[field] = 0x5A
    a, b = pack(base), pack(probe)
    return next(i for i, (x, y) in enumerate(zip(a, b)) if x != y)


_RACE_POSITION_AT = _byte_offset("race_position")
_cache: dict[tuple, dict] = {}


def start_signature(frames) -> tuple[bool | None, float]:
    """(lap clock reset at the first start-line crossing?, approach seconds).
    None when the session never shows an approach from negative distance."""
    approach_max = 0.0
    prev = None
    for frame in frames:
        dist = frame["distance_traveled"]
        if prev is not None and prev["distance_traveled"] < 0 <= dist:
            reset = (frame["current_lap"] < approach_max - CLOCK_RESET_MIN_S
                     and frame["current_race_time"] >= prev["current_race_time"])
            return reset, approach_max
        if dist < 0:
            approach_max = max(approach_max, frame["current_lap"])
        prev = frame
    return None, approach_max


def classify(race_positions: set[int], reset: bool | None, approach_s: float) -> dict:
    evidence = {"race_positions": sorted(race_positions),
                "start_clock_reset": reset,
                "approach_seconds": round(approach_s, 3)}
    if any(p > 1 for p in race_positions):
        kind = "race"
    elif reset:
        kind = "rivals"
    else:
        kind = "unknown"
    return {"kind": kind, "basis": "guess", "evidence": evidence}


def guess_event(store, session: dict) -> dict:
    """Guess for one stored session. Reads frames, never writes."""
    reader = getattr(store, "reader", None)
    if reader is None:
        return classify(set(), None, 0.0)
    key = (getattr(store, "db_path", None), session["id"],
           session.get("frame_count"), session.get("ended_at"))
    if key in _cache:
        return _cache[key]
    with reader() as conn:
        positions = {row[0][0] for row in conn.execute(
            "SELECT DISTINCT substr(raw, ?, 1) FROM frames WHERE session_id = ?",
            (_RACE_POSITION_AT + 1, session["id"])) if row[0]}
        head = conn.execute(
            "SELECT raw FROM frames WHERE session_id = ? AND t <= ? ORDER BY t LIMIT ?",
            (session["id"], session["started_at"] + APPROACH_SCAN_S,
             APPROACH_SCAN_FRAMES)).fetchall()
    reset, approach_s = start_signature(parse(row[0]) for row in head)
    result = classify(positions, reset, approach_s)
    if session.get("ended_at") is not None:   # a live session can still change
        _cache[key] = result
    return result
