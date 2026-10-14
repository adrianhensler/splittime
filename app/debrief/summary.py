"""Compute every debrief number locally. Never ask a model to measure a lap."""
from __future__ import annotations

import hashlib
import json
import math
from statistics import median

from fastapi import HTTPException

from ..corners.api import _reference
from ..corners.compare import compare_laps
from ..corners.detect import VERSION, detect_corners
from ..corners.trace import build_trace, samples_from_rows
from ..rivalry import _lap_out, lap_covered

REPORT_VERSION = 1
UNKNOWN_EVENT = {"kind": "unknown", "basis": "guess", "evidence": {}}


def _eligible(store, session, lap):
    return _lap_out(session, lap, {}, UNKNOWN_EVENT, lap_covered(store, lap))


def _timed(lap):
    value = lap.get("lap_time")
    return isinstance(value, (float, int)) and math.isfinite(value) and value > 0


def _trace(store, lap, digests):
    rows = list(store.lap_frames(lap))
    digest = hashlib.sha256()
    for t, raw in rows:
        digest.update(str(t).encode())
        digest.update(raw)
    digests.append([lap["id"], digest.hexdigest()])
    return build_trace(samples_from_rows(rows), start_distance=lap.get("start_distance") or 0,
                       lap_id=lap["id"], lap_time=lap["lap_time"])


def build_report(store, focus_id: int, reference_id: int | None = None) -> dict:
    focus = store.get_lap(focus_id)
    if focus is None:
        raise HTTPException(404, "Selected lap no longer exists. Refresh recordings.")
    session = store.get_session(focus["session_id"])
    if session.get("ended_at") is None:
        raise HTTPException(409, "This session is still recording. Debrief is available after it closes.")
    laps = store.session_laps(session["id"])
    projected = {lap["id"]: _eligible(store, session, lap) for lap in laps}
    valid = [lap for lap in laps if projected[lap["id"]]["candidate_clean"]]
    confirmed = [lap for lap in valid if projected[lap["id"]]["finish"] == "confirmed"]
    times = [lap["lap_time"] for lap in confirmed]
    best = min(valid, key=lambda lap: lap["lap_time"], default=None)
    facts, warnings, digests = [], [], []

    def fact(fid, text, metrics, actions):
        facts.append({"id": fid, "text": text, "metrics": metrics, "actions": actions})

    stats = {"laps_runs": len(laps), "timed": sum(_timed(lap) for lap in laps),
             "eligible": len(valid), "confirmed": len(confirmed),
             "estimated": sum(p["finish"] == "last_packet" for p in projected.values()),
             "best_s": round(best["lap_time"], 3) if best else None,
             "best_lap_id": best["id"] if best else None,
             "best_estimated": bool(best and projected[best["id"]]["finish"] == "last_packet"),
             "median_s": round(median(times), 3) if times else None,
             "spread_s": round(max(times) - min(times), 3) if len(times) >= 2 else None}
    fact("session", f"{len(valid)} of {len(laps)} recorded laps/runs count as eligible bests.",
         {"eligible": len(valid), "recorded": len(laps)}, ["repeat", "capture"])
    if len(times) >= 2:
        fact("consistency", f"The {len(times)} eligible confirmed times span {stats['spread_s']:.3f} s; "
             f"median {stats['median_s']:.3f} s.",
             {"samples": len(times), "spread_s": stats["spread_s"], "median_s": stats["median_s"]},
             ["repeat"])
    # Previous PB is for this driver, route, exact car and PI, before this session.
    previous = []
    if all(session.get(k) is not None for k in
           ("driver_id", "route_id", "car_ordinal", "car_pi", "car_class")):
        for other in store.list_sessions():
            same = all(other.get(k) == session.get(k) for k in
                       ("driver_id", "route_id", "car_ordinal", "car_pi", "car_class"))
            if same and other.get("ended_at") is not None and (
                    other["ended_at"] <= session["started_at"]):
                previous.extend(lap for lap in store.session_laps(other["id"])
                                if _eligible(store, other, lap)["candidate_clean"])
    prior = min(previous, key=lambda lap: lap["lap_time"], default=None)
    stats["previous_best_s"] = round(prior["lap_time"], 3) if prior else None
    stats["improvement_s"] = round(prior["lap_time"] - best["lap_time"], 3) if prior and best else None
    if prior and best:
        delta = stats["improvement_s"]
        fact("progress", f"Session best is {abs(delta):.3f} s {'quicker' if delta > 0 else 'slower' if delta < 0 else 'equal'} "
             "against the previous recorded best in the same car and PI (estimates may be included).",
             {"improvement_s": delta}, ["repeat", "capture"])

    pair = None
    if reference_id is not None:
        reference = store.get_lap(reference_id)
        if reference is None:
            raise HTTPException(404, "Reference lap no longer exists. Refresh recordings.")
        other = store.get_session(reference["session_id"])
        if reference_id == focus_id or session.get("route_id") is None or (
                session["route_id"] != other.get("route_id")):
            raise HTTPException(409, "Choose different laps on the same known route.")
        pair = {"a": focus_id, "b": reference_id, "difference_s": None,
                "coaching_available": False, "reference_lap_id": None}
        if _timed(focus) and _timed(reference):
            pair["difference_s"] = round(reference["lap_time"] - focus["lap_time"], 3)
        quality = [_eligible(store, session, focus), _eligible(store, other, reference)]
        pair["a_finish"], pair["b_finish"] = (p["finish"] for p in quality)
        pair["a_eligible"], pair["b_eligible"] = (p["candidate_clean"] for p in quality)
        if any(not p["candidate_clean"] or p["finish"] != "confirmed" for p in quality):
            warnings.append("Corner priorities withheld: selected laps must be eligible, confirmed finishes.")
        elif other.get("ended_at") is None:
            warnings.append("Corner priorities withheld: the reference session is still recording.")
        elif any(session.get(k) is None or session.get(k) != other.get(k)
                 for k in ("car_ordinal", "car_pi", "car_class")):
            warnings.append("Corner priorities withheld: selected cars and PI must match.")
        else:
            detector_lap, detector_warnings = _reference(store, session["route_id"])
            a, b = _trace(store, focus, digests), _trace(store, reference, digests)
            detector = (a if detector_lap["id"] == focus_id else
                        b if detector_lap["id"] == reference_id else
                        _trace(store, detector_lap, digests))
            corners = detect_corners(detector)
            measured = compare_laps(a, b, corners)
            pair["reference_lap_id"] = detector_lap["id"]
            warnings.extend(detector_warnings)
            if not measured["comparable"] or any(
                    t.capture_quality != "continuous" for t in (a, b, detector)):
                warnings.append("Corner priorities withheld: incomplete coverage, capture gaps or uncertain clocks.")
            else:
                pair["coaching_available"] = True
                ranked = sorted((s for s in measured["segments"] if s["kind"] == "corner"
                                 and not s.get("partial")), key=lambda s: abs(s["dt"]), reverse=True)
                gains = [s for s in ranked if s["dt"] >= 0][:3]
                losses = [s for s in ranked if s["dt"] < 0][:3]
                for segment in sorted(gains + losses, key=lambda s: abs(s["dt"]), reverse=True):
                    n, dt = segment["n"], segment["dt"]
                    actions = ["entry_exit"]
                    for key, action in (("brake_onset_s", "braking"), ("throttle_on_s", "throttle")):
                        if all(segment[side][key] is not None for side in ("a", "b")):
                            actions.append(action)
                    fact(f"corner_{n}", f"C{n}: A {'gained' if dt >= 0 else 'lost'} {abs(dt):.3f} s "
                         "against B over this corner.",
                         {"corner": n, "gain_s": dt, "a": segment["a"], "b": segment["b"]}, actions)
    else:
        warnings.append("Choose a B lap to add measured corner differences.")
    warnings.append("Exploratory telemetry: route equivalence and official game validity are unverified. "
                    "Measurements do not establish why time differed.")
    report = {"version": REPORT_VERSION, "session_id": session["id"],
              "focus_lap_id": focus_id, "reference_lap_id": reference_id,
              "stats": stats, "pair": pair, "facts": facts, "warnings": warnings}
    # Edits, reprocessing, frame content, detector reference and policy versions invalidate AI.
    source = {"report": report, "laps": laps, "focus": focus,
              "reference": reference if reference_id is not None else None,
              "traces": digests, "detector_version": VERSION}
    report["fingerprint"] = hashlib.sha256(json.dumps(source, sort_keys=True,
                                                     allow_nan=False).encode()).hexdigest()
    return report
