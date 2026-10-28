"""Measure two runs section by section. Every number a race report may state is here.

A is the selected lap, B the reference. A positive `a_gain_s` means A was quicker
over that stretch; `d_*` fields are A's value minus B's, computed here so a
writer never has to do arithmetic.
"""
from __future__ import annotations

import bisect
import hashlib
import json
import math

from fastapi import HTTPException

from ..corners.api import _reference
from ..corners.compare import compare_laps
from ..corners.detect import VERSION as DETECTOR_VERSION, detect_corners
from ..corners.trace import REWIND_EPS, build_trace, samples_from_rows
from ..debrief.summary import _eligible
from ..telemetry.packet import parse

REPORT_VERSION = 1
FLAT = 250        # accel and brake are 0-255: at least 98 % is flat out
PRESSED = 13      # above 5 % is "on" the pedal
SPIN = 1.0        # rear combined slip above this is wheelspin or a slide
G = 9.81
SECTION_M = 900   # about one section per this many metres, clamped to 4..7
LINE_WINDOW_M = 150.0
LINE_STEP = 8     # compare one A position in this many with B's line
FIRST_STRETCH_M = 250  # the launch: time over the first this-many metres


def _frames(rows, start_distance):
    """(s, frame) in distance order; a rewound stretch keeps only its last pass.
    Stationary samples stay, since input shares count samples (build_trace's rule)."""
    out = []
    for _, raw in rows:
        frame = parse(raw)
        s = frame["distance_traveled"] - start_distance
        if out and s < out[-1][0] - REWIND_EPS:
            while out and out[-1][0] >= s:
                out.pop()
        out.append((s, frame))
    return out


def _share(frames, test):
    return round(100 * sum(1 for _, f in frames if test(f)) / len(frames)) if frames else None


def _inputs(frames, whole=False):
    """One driver's inputs over a stretch, as shares of samples (constant rate per lap).
    Kerb use is only summarised for the whole run, to keep the request small."""
    if not frames:
        return None
    out = {
        "flat_pct": _share(frames, lambda f: f["accel"] >= FLAT),
        "brake_pct": _share(frames, lambda f: f["brake"] > PRESSED),
        "coast_pct": _share(frames, lambda f: f["accel"] < PRESSED and f["brake"] <= PRESSED),
        "peak_brake_pct": round(max(f["brake"] for _, f in frames) / 2.55),
        "min_kmh": round(min(f["speed"] for _, f in frames) * 3.6),
        "max_kmh": round(max(f["speed"] for _, f in frames) * 3.6),
        "max_g": round(max(abs(f["accel_x"]) for _, f in frames) / G, 1),
        "spin_pct": _share(frames, lambda f: max(f["tire_combined_slip"][2:]) > SPIN),
    }
    if whole:
        out["kerb_pct"] = _share(frames, lambda f: any(f["wheel_on_rumble_strip"]))
    return out


def _diff(a, b, keys):
    return {f"d_{k}": a[k] - b[k] for k in keys
            if a and b and a.get(k) is not None and b.get(k) is not None}


def _style(frames):
    """How a driver's controls read: an on/off device sends only the end values."""
    if not frames:
        return {}
    pedals = sum(1 for _, f in frames if f["accel"] in (0, 255) and f["brake"] in (0, 255))
    steer = sum(1 for _, f in frames if abs(f["steer"]) in (0, 127))
    return {"pedals": "on_off" if pedals >= 0.99 * len(frames) else "progressive",
            "steering": "on_off" if steer >= 0.99 * len(frames) else "progressive"}


def _between(frames, keys, lo, hi):
    return frames[bisect.bisect_left(keys, lo):bisect.bisect_left(keys, hi)]


def _line_gap(a, a_keys, b, b_keys, lo, hi, window):
    """Largest distance from A's path to B's nearest point over [lo, hi), metres
    (from positions); `window` is LINE_WINDOW_M in route units."""
    worst = None
    for s, f in _between(a, a_keys, lo, hi)[::LINE_STEP]:
        near = _between(b, b_keys, s - window, s + window)[::2]
        if near:
            d = min(math.hypot(f["pos_x"] - g["pos_x"], f["pos_z"] - g["pos_z"]) for _, g in near)
            worst = d if worst is None else max(worst, d)
    return None if worst is None else round(worst)


def _gear_at(frames, keys, s):
    if s is None or not frames:
        return None
    i = min(bisect.bisect_left(keys, s), len(frames) - 1)
    return frames[i][1]["gear"] or None


def _sections(segments, lo, hi, metres_per_unit):
    count = max(4, min(7, round((hi - lo) * metres_per_unit / SECTION_M)))
    out, current = [], []
    for seg in segments:
        current.append(seg)
        if seg["s_to"] >= lo + (len(out) + 1) * (hi - lo) / count or seg is segments[-1]:
            out.append(current)
            current = []
    return out


def build(store, lap_a: int, lap_b: int, names: dict | None = None) -> dict:
    if lap_a == lap_b:
        raise HTTPException(409, "Choose two different laps.")
    laps, sessions, quality = [], [], []
    for lap_id in (lap_a, lap_b):
        lap = store.get_lap(lap_id)
        if lap is None:
            raise HTTPException(404, "Selected lap no longer exists. Refresh recordings.")
        session = store.get_session(lap["session_id"])
        if session.get("ended_at") is None:
            raise HTTPException(409, "A selected session is still recording. The race report is available after it closes.")
        laps.append(lap)
        sessions.append(session)
        quality.append(_eligible(store, session, lap))
    if sessions[0].get("route_id") is None or sessions[0]["route_id"] != sessions[1].get("route_id"):
        raise HTTPException(409, "Choose laps on the same known route.")
    if not all(q["candidate_clean"] for q in quality):
        raise HTTPException(409, "Race reports compare eligible bests only: both runs must be clean "
                                 "and cover the whole route.")

    digest_rows, frames, traces = [], [], []
    for lap in laps:
        rows = list(store.lap_frames(lap))
        digest = hashlib.sha256()
        for t, raw in rows:
            digest.update(str(t).encode())
            digest.update(raw)
        digest_rows.append([lap["id"], digest.hexdigest()])
        start = lap.get("start_distance") or 0
        frames.append(_frames(rows, start))
        traces.append(build_trace(samples_from_rows(rows), start_distance=start,
                                  lap_id=lap["id"], lap_time=lap["lap_time"]))
    a_trace, b_trace = traces
    detector_lap, detector_warnings = _reference(store, sessions[0]["route_id"])
    detector = (a_trace if detector_lap["id"] == lap_a else b_trace if detector_lap["id"] == lap_b else
                build_trace(samples_from_rows(store.lap_frames(detector_lap)),
                            start_distance=detector_lap.get("start_distance") or 0,
                            lap_id=detector_lap["id"], lap_time=detector_lap["lap_time"]))
    route = detect_corners(detector)
    measured = compare_laps(a_trace, b_trace, route)
    # distance_traveled is the game's route parameter, not metres (CORNER_CONTRACT):
    # every lap reads about 5,950 units whatever its length. The reference lap's
    # driven path converts it; the average is approximate where spacing varies.
    mpu = route.metres_per_unit
    if not mpu or not math.isfinite(mpu) or mpu <= 0:
        raise HTTPException(409, "These runs cannot be compared section by section: the route "
                                 "length could not be measured.")

    def metres(units):
        return None if units is None else round(units * mpu)
    if not measured["comparable"] or any(t.capture_quality != "continuous"
                                         for t in (a_trace, b_trace, detector)):
        raise HTTPException(409, "These runs cannot be compared section by section: incomplete "
                                 "coverage, capture gaps or uncertain clocks.")

    a, b = frames
    a_keys, b_keys = [s for s, _ in a], [s for s, _ in b]
    segments = measured["segments"]
    lo, hi = segments[0]["s_from"], segments[-1]["s_to"]
    sections, ahead = [], 0.0
    for n, group in enumerate(_sections(segments, lo, hi, mpu), start=1):
        s0, s1 = group[0]["s_from"], group[-1]["s_to"]
        gain = sum(seg["dt"] for seg in group)
        ahead += gain
        ia, ib = _inputs(_between(a, a_keys, s0, s1)), _inputs(_between(b, b_keys, s0, s1))
        sections.append({
            "n": n, "from_m": metres(s0), "to_m": metres(s1),
            "corners": [seg["n"] for seg in group if seg["kind"] == "corner"],
            "a_gain_s": round(gain, 3), "a_ahead_after_s": round(ahead, 3),
            "line_gap_m": _line_gap(a, a_keys, b, b_keys, s0, s1, LINE_WINDOW_M / mpu),
            "a": ia, "b": ib,
            **_diff(ia, ib, ("flat_pct", "min_kmh", "max_kmh", "coast_pct", "max_g")),
        })

    corners = []
    ranked = sorted((seg for seg in segments if seg["kind"] == "corner" and not seg.get("partial")),
                    key=lambda seg: abs(seg["dt"]), reverse=True)
    for seg in ranked[:4]:
        side = {}
        for name, fr, keys in (("a", a, a_keys), ("b", b, b_keys)):
            m = seg[name]
            side[name] = {"entry_kmh": _round(m["entry_kmh"]), "min_kmh": _round(m["min_kmh"]),
                          "exit_kmh": _round(m["exit_kmh"]), "gear": _gear_at(fr, keys, m["s_min"]),
                          "brake_at_m": metres(m["brake_onset_s"]), "throttle_at_m": metres(m["throttle_on_s"])}
        pa, pb = side["a"], side["b"]
        extra = _diff(pa, pb, ("entry_kmh", "min_kmh", "exit_kmh"))
        if pa["brake_at_m"] is not None and pb["brake_at_m"] is not None:
            extra["a_brakes_later_m"] = pa["brake_at_m"] - pb["brake_at_m"]
        if pa["throttle_at_m"] is not None and pb["throttle_at_m"] is not None:
            extra["a_throttle_earlier_m"] = pb["throttle_at_m"] - pa["throttle_at_m"]
        corners.append({"c": seg["n"], "at_m": metres(seg["s_from"]), "a_gain_s": seg["dt"],
                        **side, **extra})

    lap_facts = {}
    for name, lap, fr, trace, q in (("a", laps[0], a, a_trace, quality[0]),
                                    ("b", laps[1], b, b_trace, quality[1])):
        whole = _inputs(fr, whole=True)
        lap_facts[name] = {"time_s": round(lap["lap_time"], 3),
                           "finish": "estimated" if q["finish"] == "last_packet" else "game_timed",
                           "first_stretch_m": round(min(FIRST_STRETCH_M, (hi - lo) * mpu)),
                           "first_stretch_s": round(trace.clock_at(min(lo + FIRST_STRETCH_M / mpu, hi))
                                                    - trace.clock_at(lo), 3),
                           **{k: whole[k] for k in ("flat_pct", "coast_pct", "max_kmh", "max_g",
                                                    "spin_pct", "kerb_pct")},
                           **_style(fr)}
    facts = {
        "a_gain_s": round(laps[1]["lap_time"] - laps[0]["lap_time"], 3),
        "route_m": metres(hi - lo),
        "same_car": all(sessions[0].get(k) is not None and sessions[0].get(k) == sessions[1].get(k)
                        for k in ("car_ordinal", "car_pi")),
        "lap": lap_facts,
        "sections": sections,
        "corners": corners,
    }
    warnings = list(detector_warnings)
    if any(q["finish"] == "last_packet" for q in quality):
        warnings.append("Finish times estimated from the last packet; section times use the game clock.")
    if not facts["same_car"]:
        warnings.append("Different cars or PI: differences include the car, not only the driving.")
    warnings.append("Distances are approximate: the game's route position is converted to metres "
                    "with the reference lap's average.")
    warnings.append("Exploratory telemetry: route equivalence and official game validity are unverified.")
    # Gamertags go to the writer (ADR 33); a rename is a new report.
    ids = [s.get("driver_id") or "legacy" for s in sessions]
    tags = [str((names or {}).get(i, i))[:40] for i in ids]
    if tags[0].casefold() == tags[1].casefold():  # one driver's two runs
        tags = [f"{tags[0]} (A)", f"{tags[1]} (B)"]
    report = {"version": REPORT_VERSION, "lap_a": lap_a, "lap_b": lap_b,
              "route_id": sessions[0]["route_id"], "reference_lap_id": detector_lap["id"],
              "drivers": {"a": tags[0], "b": tags[1]}, "facts": facts, "warnings": warnings}
    # Edits, reprocessing, frame content and detector version all invalidate a cached narrative.
    source = {"report": report, "laps": laps, "frames": digest_rows, "detector": DETECTOR_VERSION}
    legacy = _digest({**source, "report": _legacy(report)})  # before either is added to it
    report["fingerprint"], report["legacy_fingerprint"] = _digest(source), legacy
    return report


def _digest(source):
    return hashlib.sha256(json.dumps(source, sort_keys=True, allow_nan=False).encode()).hexdigest()


def _legacy(report):
    """The report as built before 2026-10-28, when the launch time was the key
    `first_250m_s`: its fingerprint finds reviews cached under the old shape."""
    lap = {side: {("first_250m_s" if k == "first_stretch_s" else k): v
                  for k, v in fields.items() if k != "first_stretch_m"}
           for side, fields in report["facts"]["lap"].items()}
    return {**report, "facts": {**report["facts"], "lap": lap}}


def _round(value):
    return None if value is None else round(value)
