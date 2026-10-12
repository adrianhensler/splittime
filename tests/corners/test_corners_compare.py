"""Two-lap comparison: segments that add up, honest nulls, hostile input."""

from __future__ import annotations

import itertools
import json

import pytest

from app.corners import build_trace, compare_laps, detect_corners
from corner_course import Course
from test_corners_detect import TWISTY


def _corners(result):
    return [seg for seg in result["segments"] if seg["kind"] == "corner"]


def test_segments_cover_the_lap_and_add_up_to_the_lap_time_difference(sim_traces):
    """WP-005 acceptance: corner and straight deltas sum to the lap delta
    within 0.05 s. `lap_time_dt` is the game's own LastLap difference."""
    route = detect_corners(sim_traces[0])
    for a, b in itertools.permutations(sim_traces, 2):
        result = compare_laps(a, b, route)
        assert result["comparable"], result["reasons"]
        segments = result["segments"]
        # contiguous, no gaps or overlaps
        for left, right in zip(segments, segments[1:]):
            assert left["s_to"] == right["s_from"]
        assert all(seg["time_a"] > 0 and seg["time_b"] > 0 for seg in segments)
        assert abs(sum(seg["dt"] for seg in segments) - result["totals"]["dt"]) < 0.002 * len(segments)
        assert abs(result["sum_check"]["residual"]) < 0.05
        assert [seg["n"] for seg in _corners(result)] == [1, 2]


def test_comparison_is_antisymmetric_and_a_lap_ties_with_itself(sim_traces):
    route = detect_corners(sim_traces[0])
    forward = compare_laps(sim_traces[1], sim_traces[2], route)
    backward = compare_laps(sim_traces[2], sim_traces[1], route)
    for f, b in zip(forward["segments"], backward["segments"], strict=True):
        assert f["dt"] == pytest.approx(-b["dt"], abs=0.002)
    same = compare_laps(sim_traces[1], sim_traces[1], route)
    assert all(seg["dt"] == 0 for seg in same["segments"])
    assert same["totals"]["dt"] == 0


def test_less_grip_loses_time_in_every_corner_and_the_ranking_says_where():
    a = build_trace(TWISTY.drive(), lap_id=1)
    b = build_trace(TWISTY.drive(grip=9.0), lap_id=2)
    result = compare_laps(a, b, detect_corners(a))
    corners = _corners(result)
    assert len(corners) == 4
    for seg in corners[:3]:  # corner 4 is flat for A; B has to lift for it
        assert seg["dt"] > 0
        assert seg["b"]["min_kmh"] < seg["a"]["min_kmh"]
    by_size = sorted(corners, key=lambda seg: abs(seg["dt"]), reverse=True)
    assert result["largest"] == [seg["n"] for seg in by_size]
    assert result["totals"]["dt"] > 0


def test_inputs_are_positions_or_null_never_zero():
    a = build_trace(TWISTY.drive(), lap_id=1)
    result = compare_laps(a, a, detect_corners(a))
    hairpin, _, _, flat = _corners(result)
    # braked for the hairpin, before its entry, and got back on throttle after the slowest point
    assert hairpin["a"]["brake_onset_s"] < hairpin["s_from"]
    assert hairpin["a"]["throttle_on_s"] >= hairpin["a"]["s_min"]
    # the wide last corner is taken flat: no braking happened, so no position
    assert flat["a"]["brake_onset_s"] is None
    assert flat["a"]["min_kmh"] > 200


def test_frames_missing_mid_corner_are_flagged_and_barely_move_the_times():
    samples = TWISTY.drive()
    whole = build_trace(samples, lap_id=1)
    route = detect_corners(whole)
    inside_hairpin = [i for i, (_, dist, _) in enumerate(samples)
                      if route.corners[0].s_entry < dist < route.corners[0].s_exit]
    cut = inside_hairpin[len(inside_hairpin) // 2]
    holed = build_trace(samples[:cut] + samples[cut + 40:], lap_id=2)  # ~0.67 s lost

    assert whole.capture_quality == "continuous"
    assert holed.capture_quality == "discontinuous"
    assert len(holed.gaps) == 1
    assert route.corners[0].s_entry < holed.gaps[0]["s"] < route.corners[0].s_exit

    result = compare_laps(whole, holed, route)
    assert result["b"]["capture_quality"] == "discontinuous"
    assert (result["a"]["gaps"], result["b"]["gaps"]) == (0, 1)
    # the game clock kept counting through the hole, so segment times survive it
    assert all(abs(seg["dt"]) < 0.02 for seg in result["segments"])


def test_a_rewound_stretch_is_dropped_so_only_the_final_pass_counts():
    samples = TWISTY.drive()
    clean = build_trace(samples)
    at_500 = next(i for i, (_, dist, _) in enumerate(samples) if dist >= 500)
    at_350 = next(i for i, (_, dist, _) in enumerate(samples) if dist >= 350)
    # the game rewinds position, distance and clocks together, then the driver redoes it
    rewound = build_trace(samples[:at_500] + samples[at_350:])
    assert rewound.s == clean.s
    assert rewound.clock == clean.clock
    assert all(later >= earlier for earlier, later in zip(rewound.s, rewound.s[1:]))


def test_timing_source_falls_back_and_mixed_sources_are_not_comparable():
    lap = build_trace(TWISTY.drive(), lap_id=1)
    race = build_trace(TWISTY.drive(lap_clock=False), lap_id=2)
    arrival = build_trace(TWISTY.drive(lap_clock=False, race_clock=False), lap_id=3)
    assert (lap.timing_source, race.timing_source, arrival.timing_source) == (
        "game_lap_clock", "game_race_clock", "arrival_time")

    route = detect_corners(lap)
    like_for_like = compare_laps(race, race, route)
    assert like_for_like["comparable"]
    # arrival time crossed the internet: fine to look at, never to rank on,
    # even when both laps are timed the same way
    by_arrival = compare_laps(arrival, arrival, route)
    assert not by_arrival["comparable"]
    assert by_arrival["reasons"] == ["arrival_time_timing"]
    assert len(_corners(by_arrival)) == 4
    mixed = compare_laps(lap, arrival, route)
    assert not mixed["comparable"]
    assert "different_timing_source" in mixed["reasons"]
    # the numbers are still there for an exploratory look
    assert len(_corners(mixed)) == 4


def test_laps_from_different_routes_are_refused_not_scored():
    a = build_trace(TWISTY.drive(), lap_id=1)
    route = detect_corners(a)

    short = build_trace(Course(("straight", 500), ("arc", 60, 90), ("straight", 300)).drive())
    assert "laps_cover_different_distance" in compare_laps(a, short, route)["reasons"]

    elsewhere = build_trace(TWISTY.drive(origin=(3000.0, 0.0)))
    result = compare_laps(a, elsewhere, route)
    assert not result["comparable"]
    assert result["reasons"] == ["different_start_position"]


def test_an_abandoned_lap_is_not_comparable_and_its_cut_corner_is_marked_partial():
    samples = TWISTY.drive()
    whole = build_trace(samples, lap_id=1)
    route = detect_corners(whole)
    chicane_out = route.corners[2]
    middle = (chicane_out.s_entry + chicane_out.s_exit) / 2
    abandoned = build_trace([s for s in samples if s[1] <= middle], lap_id=2)

    result = compare_laps(whole, abandoned, route)
    assert not result["comparable"]
    assert "laps_cover_different_distance" in result["reasons"]
    corners = _corners(result)
    assert [seg["n"] for seg in corners] == [1, 2, 3]   # corner 4 was never reached
    assert corners[-1].get("partial") is True
    assert "partial" not in corners[0]


def test_too_little_data_is_a_reason_not_a_crash():
    a = build_trace(TWISTY.drive(), lap_id=1)
    route = detect_corners(a)
    for thin in (build_trace([]), build_trace(TWISTY.drive()[:20])):
        result = compare_laps(a, thin, route)
        assert result == {**result, "comparable": False, "reasons": ["too_few_samples"],
                          "segments": [], "totals": None, "largest": []}


def test_start_distance_offset_and_unit_scale_do_not_change_the_answer():
    """Circuit laps keep accumulating DistanceTraveled; `start_distance` is
    what brings lap 3 back onto lap 1's axis."""
    a = build_trace(TWISTY.drive(), lap_id=1)
    b_samples = TWISTY.drive(grip=10.0)
    b = build_trace(b_samples, lap_id=2)
    shifted = build_trace(TWISTY.drive(grip=10.0, start_dist=5000.0),
                          start_distance=5000.0, lap_id=2)
    route = detect_corners(a)
    assert compare_laps(a, shifted, route)["totals"] == compare_laps(a, b, route)["totals"]

    scaled_course = Course(*TWISTY.pieces, units_per_metre=2.45)
    sa = build_trace(scaled_course.drive(), lap_id=1)
    sb = build_trace(scaled_course.drive(grip=10.0), lap_id=2)
    scaled = compare_laps(sa, sb, detect_corners(sa))
    plain = compare_laps(a, b, route)
    assert scaled["totals"]["dt"] == pytest.approx(plain["totals"]["dt"], abs=0.02)
    for s_seg, p_seg in zip(_corners(scaled), _corners(plain), strict=True):
        assert s_seg["dt"] == pytest.approx(p_seg["dt"], abs=0.05)
        assert s_seg["a"]["min_kmh"] == pytest.approx(p_seg["a"]["min_kmh"], abs=0.5)


def test_result_is_plain_json_with_the_contract_fields(sim_traces):
    route = detect_corners(sim_traces[0])
    payload = json.loads(json.dumps(compare_laps(sim_traces[0], sim_traces[1], route)))
    assert set(payload) == {"version", "comparable", "reasons", "a", "b", "segments",
                            "totals", "sum_check", "largest"}
    assert set(payload["a"]) == {"lap_id", "timing_source", "capture_quality", "gaps", "samples"}
    corner = _corners(payload)[0]
    assert set(corner) == {"kind", "n", "s_from", "s_to", "time_a", "time_b", "dt", "a", "b"}
    assert set(corner["a"]) == {"entry_kmh", "min_kmh", "s_min", "exit_kmh",
                                "brake_onset_s", "throttle_on_s"}
    assert set(payload["sum_check"]) == {"segments_dt", "lap_time_dt", "residual"}
