"""Measure two laps against a route's corners and say where time differed.

Output shape: docs/CORNER_CONTRACT.md section 4. Measurements only - nothing
here says why a driver was faster.
"""

from __future__ import annotations

import math

from .detect import MIN_SAMPLES, VERSION, Corner, RouteCorners
from .trace import Trace

BRAKE_ON_PCT = 10.0
THROTTLE_ON_PCT = 50.0
SUSTAIN_SAMPLES = 3         # an input must hold this many samples to count
APPROACH_M = 300.0          # how far before a corner braking for it can start
RUNOUT_M = 300.0            # how far past a corner throttle pickup is looked for
# two laps "cover the same stretch" when their overlap is at least this share
# of each lap's own length, and they start within this distance of each other
MIN_OVERLAP = 0.90
MAX_START_GAP_M = 150.0


def _r(value: float | None, digits: int) -> float | None:
    return None if value is None else round(value, digits)


def _first_sustained(values: list[float], indices: range, threshold: float) -> int | None:
    run = 0
    for i in indices:
        if values[i] >= threshold:
            run += 1
            if run >= SUSTAIN_SAMPLES:
                return i - SUSTAIN_SAMPLES + 1
        else:
            run = 0
    return None


def _measure(trace: Trace, corner: Corner, s_prev_exit: float, s_next_entry: float,
             units_per_metre: float) -> dict:
    """One lap's numbers for one corner. Anything that cannot be measured is
    None, never zero."""
    inside = trace.index_range(corner.s_entry, corner.s_exit)
    entry = trace.at(trace.speed, corner.s_entry)
    exit_ = trace.at(trace.speed, corner.s_exit)
    out = {"entry_kmh": _r(entry * 3.6, 1) if entry is not None else None,
           "min_kmh": None, "s_min": None,
           "exit_kmh": _r(exit_ * 3.6, 1) if exit_ is not None else None,
           "brake_onset_s": None, "throttle_on_s": None}
    if len(inside) == 0:
        return out

    slowest = min(inside, key=lambda i: trace.speed[i])
    out["min_kmh"] = _r(trace.speed[slowest] * 3.6, 1)
    out["s_min"] = _r(trace.s[slowest], 2)

    approach_from = max(s_prev_exit, corner.s_entry - APPROACH_M * units_per_metre)
    i = _first_sustained(trace.brake, trace.index_range(approach_from, corner.s_apex),
                         BRAKE_ON_PCT)
    if i is not None:
        out["brake_onset_s"] = _r(trace.s[i], 2)

    runout_to = min(s_next_entry, corner.s_exit + RUNOUT_M * units_per_metre)
    i = _first_sustained(trace.throttle, trace.index_range(trace.s[slowest], runout_to),
                         THROTTLE_ON_PCT)
    if i is not None:
        out["throttle_on_s"] = _r(trace.s[i], 2)
    return out


def _lap_summary(trace: Trace) -> dict:
    return {"lap_id": trace.lap_id, "timing_source": trace.timing_source,
            "capture_quality": trace.capture_quality, "gaps": len(trace.gaps),
            "samples": len(trace)}


def compare_laps(a: Trace, b: Trace, route: RouteCorners) -> dict:
    """Split both laps at the route's corner boundaries and compare them.

    The segments cover the stretch both laps share, end to end, so their time
    differences add up to the difference over that stretch. Never raises on
    thin or mismatched input: `comparable` goes false and `reasons` say why.
    """
    result: dict = {"version": VERSION, "comparable": True, "reasons": [],
                    "a": _lap_summary(a), "b": _lap_summary(b),
                    "segments": [], "totals": None,
                    "sum_check": {"segments_dt": None, "lap_time_dt": None, "residual": None},
                    "largest": []}
    reasons: list[str] = result["reasons"]

    if len(a) < MIN_SAMPLES or len(b) < MIN_SAMPLES:
        reasons.append("too_few_samples")
        result["comparable"] = False
        return result

    lo, hi = max(a.s[0], b.s[0]), min(a.s[-1], b.s[-1])
    span_a, span_b = a.s[-1] - a.s[0], b.s[-1] - b.s[0]
    if hi <= lo or span_a <= 0 or span_b <= 0:
        reasons.append("no_shared_distance")
        result["comparable"] = False
        return result
    if (hi - lo) < MIN_OVERLAP * max(span_a, span_b):
        reasons.append("laps_cover_different_distance")
    if math.hypot(a.x[0] - b.x[0], a.z[0] - b.z[0]) > MAX_START_GAP_M:
        reasons.append("different_start_position")
    if a.timing_source != b.timing_source:
        reasons.append("different_timing_source")
    if "arrival_time" in (a.timing_source, b.timing_source):
        # packets crossed the internet: arrival times carry jitter and loss, so
        # they may illustrate a lap but never decide who was faster
        reasons.append("arrival_time_unverified")
    result["comparable"] = not reasons

    units_per_metre = 1.0 / route.metres_per_unit if route.metres_per_unit else 1.0
    corners = [c for c in route.corners if c.s_exit > lo and c.s_entry < hi]

    def segment(kind: str, s_from: float, s_to: float, corner: Corner | None,
                partial: bool = False) -> dict:
        time_a = a.clock_at(s_to) - a.clock_at(s_from)
        time_b = b.clock_at(s_to) - b.clock_at(s_from)
        seg = {"kind": kind, "n": corner.n if corner else None,
               "s_from": _r(s_from, 2), "s_to": _r(s_to, 2),
               "time_a": _r(time_a, 3), "time_b": _r(time_b, 3),
               "dt": _r(time_b - time_a, 3), "_dt": time_b - time_a}
        if partial:
            seg["partial"] = True
        return seg

    segments: list[dict] = []
    cursor = lo
    for index, corner in enumerate(corners):
        s_from, s_to = max(corner.s_entry, lo), min(corner.s_exit, hi)
        if s_from > cursor:
            segments.append(segment("straight", cursor, s_from, None))
        seg = segment("corner", s_from, s_to, corner,
                      partial=corner.s_entry < lo or corner.s_exit > hi)
        s_prev_exit = corners[index - 1].s_exit if index else lo
        s_next_entry = corners[index + 1].s_entry if index + 1 < len(corners) else hi
        seg["a"] = _measure(a, corner, s_prev_exit, s_next_entry, units_per_metre)
        seg["b"] = _measure(b, corner, s_prev_exit, s_next_entry, units_per_metre)
        segments.append(seg)
        cursor = s_to
    if cursor < hi:
        segments.append(segment("straight", cursor, hi, None))

    segments_dt = sum(seg.pop("_dt") for seg in segments)
    total_a = a.clock_at(hi) - a.clock_at(lo)
    total_b = b.clock_at(hi) - b.clock_at(lo)
    result["segments"] = segments
    result["totals"] = {"time_a": _r(total_a, 3), "time_b": _r(total_b, 3),
                        "dt": _r(total_b - total_a, 3)}
    lap_time_dt = (b.lap_time - a.lap_time
                   if a.lap_time is not None and b.lap_time is not None else None)
    result["sum_check"] = {
        "segments_dt": _r(segments_dt, 3),
        "lap_time_dt": _r(lap_time_dt, 3),
        "residual": _r(lap_time_dt - segments_dt, 3) if lap_time_dt is not None else None,
    }
    ranked = sorted((seg for seg in segments if seg["kind"] == "corner"),
                    key=lambda seg: abs(seg["dt"]), reverse=True)
    result["largest"] = [seg["n"] for seg in ranked]
    return result
