"""Corner detection: route-fixed, numbered, stable across laps and inputs."""

from __future__ import annotations

import json

from app.corners import build_trace, detect_corners
from corner_course import Course

# hairpin right, short straight, right-left chicane, a 10-degree kink that
# must not count, and a wide corner taken flat
TWISTY = Course(
    ("straight", 400), ("arc", 30, 180), ("straight", 300),
    ("arc", 80, 60), ("arc", 80, -60), ("straight", 300),
    ("arc", 1500, 10), ("straight", 200),
    ("arc", 300, -40), ("straight", 250),
)


def test_simulator_circuit_has_its_two_known_corners(sim_traces):
    route = detect_corners(sim_traces[0])

    assert [c.n for c in route.corners] == [1, 2]
    first, second = route.corners
    for corner in route.corners:
        assert 170 < corner.heading_change_deg < 190
        assert 110 < corner.radius_m < 130          # the arcs are 120 m radius
        assert corner.s_entry < corner.s_apex < corner.s_exit
    assert first.direction == second.direction       # a stadium loop turns one way
    assert first.kind == second.kind
    assert abs(first.s_entry - 600) < 25             # end of the first straight
    assert abs(second.s_entry - 1577) < 25           # 600 + pi*120 + 600
    assert abs(route.metres_per_unit - 1.0) < 0.01   # the simulator's odometer is metres
    assert route.reference_lap_id == sim_traces[0].lap_id


def test_corners_do_not_depend_on_which_lap_was_the_reference(sim_traces):
    """Numbering and boundaries are a property of the route: a faster or
    slower reference lap must find the same corners in the same places."""
    routes = [detect_corners(t) for t in sim_traces]
    for other in routes[1:]:
        assert len(other.corners) == len(routes[0].corners)
        for a, b in zip(routes[0].corners, other.corners):
            assert a.direction == b.direction
            assert abs(a.s_entry - b.s_entry) < 10
            assert abs(a.s_exit - b.s_exit) < 10


def test_hairpin_chicane_flat_corner_found_and_kink_ignored():
    route = detect_corners(build_trace(TWISTY.drive()))

    assert [(c.n, c.direction, c.kind) for c in route.corners] == [
        (1, "R", "hairpin"), (2, "R", "turn"), (3, "L", "turn"), (4, "L", "sweeper")]
    hairpin, chicane_in, chicane_out, flat = route.corners
    assert 170 < hairpin.heading_change_deg < 190 and 25 < hairpin.radius_m < 36
    # the chicane's two halves are separate corners that meet
    assert 50 < chicane_in.heading_change_deg < 70
    assert 50 < chicane_out.heading_change_deg < 70
    assert chicane_out.s_entry - chicane_in.s_exit < 12   # the reversal blurs a few metres
    assert 30 < flat.heading_change_deg < 50
    # nothing was detected at the 10-degree kink between them
    assert chicane_out.s_exit < 1300 < flat.s_entry


def test_a_slow_reference_lap_still_finds_tight_corners():
    """Geometry, not lateral g, has to carry a lap driven far below the limit."""
    crawl = build_trace(TWISTY.drive(top=14.0))  # ~50 km/h everywhere, under 0.3 g in most corners
    quick = build_trace(TWISTY.drive())
    slow_route, quick_route = detect_corners(crawl), detect_corners(quick)
    assert [c.direction for c in slow_route.corners] == [c.direction for c in quick_route.corners]
    for a, b in zip(slow_route.corners, quick_route.corners):
        assert abs(a.s_entry - b.s_entry) < 15
        assert abs(a.s_exit - b.s_exit) < 15


def test_packet_rate_does_not_move_the_corners():
    """PC sends 120-140 packets/s, console 60. Same road, same corners."""
    at_60 = detect_corners(build_trace(TWISTY.drive(rate=60)))
    at_140 = detect_corners(build_trace(TWISTY.drive(rate=140)))
    assert len(at_60.corners) == len(at_140.corners)
    for a, b in zip(at_60.corners, at_140.corners):
        assert a.kind == b.kind
        assert abs(a.s_entry - b.s_entry) < 5
        assert abs(a.s_apex - b.s_apex) < 15
        assert abs(a.s_exit - b.s_exit) < 5


def test_route_position_need_not_be_metres():
    """Real circuits report DistanceTraveled at ~2.4x true metres. Boundaries
    follow the game's units; radius and length stay in metres."""
    metres = detect_corners(build_trace(TWISTY.drive()))
    scaled = detect_corners(build_trace(Course(*TWISTY.pieces, units_per_metre=2.45).drive()))
    assert abs(scaled.metres_per_unit - 1 / 2.45) < 0.005
    for a, b in zip(metres.corners, scaled.corners, strict=True):
        assert abs(b.s_entry - 2.45 * a.s_entry) < 5
        assert abs(b.radius_m - a.radius_m) < 1
        assert abs(b.length_m - a.length_m) < 2


def test_landing_spike_on_a_straight_is_not_a_corner():
    samples = Course(("straight", 900)).drive()
    for _, _, frame in samples[300:302]:
        frame["accel_x"] = 75.0  # the two-frame jolt upstream's simulator uses for a landing
    route = detect_corners(build_trace(samples))
    assert route.corners == []


def test_thin_or_empty_input_returns_no_corners_and_says_why():
    for samples in ([], TWISTY.drive()[:10]):
        route = detect_corners(build_trace(samples))
        assert route.corners == []
        assert any("too short" in w for w in route.warnings)


def test_teleport_is_reported_and_does_not_inflate_the_path():
    samples = TWISTY.drive()
    clean = build_trace(samples)
    for _, _, frame in samples[500:]:
        frame["pos_x"] += 5000.0  # fast travel: the world position jumps, the odometer does not
    jumped = build_trace(samples)
    assert any("position jump" in w for w in jumped.warnings)
    assert abs(jumped.m[-1] - clean.m[-1]) < 2
    assert any("position jump" in w for w in detect_corners(jumped).warnings)


def test_result_is_plain_json_with_the_contract_fields(sim_traces):
    payload = json.loads(json.dumps(detect_corners(sim_traces[0]).to_dict()))
    assert set(payload) == {"version", "reference_lap_id", "s_start", "s_end",
                            "metres_per_unit", "direction_verified", "corners", "warnings"}
    assert payload["direction_verified"] is False  # no real capture has confirmed R/L yet
    assert set(payload["corners"][0]) == {
        "n", "direction", "kind", "heading_change_deg", "s_entry", "s_apex",
        "s_exit", "radius_m", "length_m"}
