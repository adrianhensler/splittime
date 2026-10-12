"""Endpoint functions against stores the real recorder produced.

Same approach as upstream's tests/test_api.py: the handlers are plain
functions reading `request.app.state`, so a stub request is enough.
"""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import harness
from app.corners.api import corners_compare, pick_reference, route_corners, router
from corner_course import trace_of


def _request(store):
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(store=store)))


@pytest.fixture(scope="module")
def two_routes(tmp_path_factory):
    """A circuit session and a point-to-point session: two different routes."""
    def scenario(sim):
        sim.event(100, "circuit")
        sim.race_off()
        sim.sprint(75)
        sim.race_off()

    store = harness.run(scenario, tmp_path_factory.mktemp("corners_api"))
    by_route = {}
    for session in harness.sessions(store):
        laps = harness.completed_laps(store, session["id"])
        if laps and session["route_id"] is not None:
            by_route.setdefault(session["route_id"], []).extend(laps)
    assert len(by_route) == 2
    return store, by_route


def test_router_exposes_the_two_contract_paths():
    assert {route.path for route in router.routes} == {
        "/routes/{route_id}/corners", "/corners/compare"}


def test_route_corners_endpoint(sim_store, sim_laps):
    route_id = sim_store.get_session(sim_laps[0]["session_id"])["route_id"]
    payload = json.loads(json.dumps(route_corners(route_id, _request(sim_store))))
    assert payload["route_id"] == route_id
    assert [c["n"] for c in payload["corners"]] == [1, 2]
    # all three laps are clean, so the reference is simply the fastest
    assert payload["reference_lap_id"] == min(sim_laps, key=lambda lap: lap["lap_time"])["id"]
    assert payload["warnings"] == []


def test_reference_lap_prefers_clean_over_fast():
    laps = [{"id": 1, "lap_time": 40.0, "flags": "rewind", "excluded": False},
            {"id": 2, "lap_time": 41.0, "flags": None, "excluded": True},
            {"id": 3, "lap_time": 42.0, "flags": "", "excluded": False},
            {"id": 4, "lap_time": 43.0, "flags": None, "excluded": False},
            {"id": 5, "lap_time": None, "flags": None, "excluded": False}]
    assert pick_reference(laps) == (laps[2], [])

    only_flagged = laps[:2]
    lap, warnings = pick_reference(only_flagged)
    assert lap["id"] == 1
    assert warnings == ["no clean lap on this route; reference lap 1 is flagged: rewind"]
    assert pick_reference([laps[4]]) == (None, [])
    assert pick_reference([]) == (None, [])


def test_a_rewound_or_crashed_lap_is_not_used_as_the_reference(tmp_path):
    """upstream's --dirty scenario: wall contact on lap 2, a rewind on lap 3."""
    def scenario(sim):
        sim.event(190, "dirty", dirty=True)
        sim.race_off()

    store = harness.run(scenario, tmp_path)
    session = harness.sessions(store)[0]
    laps = harness.completed_laps(store, session["id"])
    flagged = {lap["id"] for lap in laps if harness.flags_of(lap)}
    assert flagged, "the scenario should have produced flagged laps"
    payload = route_corners(session["route_id"], _request(store))
    assert payload["reference_lap_id"] not in flagged
    assert [c["n"] for c in payload["corners"]] == [1, 2]


def test_compare_endpoint_matches_the_core_and_explains_the_lap_delta(sim_store, sim_laps):
    a, b = sim_laps[1], sim_laps[2]
    payload = json.loads(json.dumps(
        corners_compare(_request(sim_store), lap_a=a["id"], lap_b=b["id"])))
    # same route row, clean game-clock laps, and still not scoreable: sharing
    # a fingerprint is not evidence the two laps ran the same event
    assert payload["comparable"] is False
    assert payload["reasons"] == ["route_equivalence_unverified"]
    # the integration adds who drove each lap; both additions must survive
    assert {"driver_id", "driver_name", "car_pi", "warnings"} <= set(payload["a"])
    assert all(seg["time_a"] > 0 and seg["time_b"] > 0 for seg in payload["segments"])
    assert payload["a"]["lap_id"] == a["id"] and payload["b"]["lap_id"] == b["id"]
    assert payload["sum_check"]["lap_time_dt"] == pytest.approx(b["lap_time"] - a["lap_time"],
                                                               abs=0.001)
    assert abs(payload["sum_check"]["residual"]) < 0.05
    assert len(payload["corners"]["corners"]) == 2


def test_unknown_ids_are_404(sim_store, sim_laps):
    with pytest.raises(HTTPException) as err:
        route_corners(9999, _request(sim_store))
    assert err.value.status_code == 404
    with pytest.raises(HTTPException) as err:
        corners_compare(_request(sim_store), lap_a=sim_laps[0]["id"], lap_b=9999)
    assert err.value.status_code == 404


def test_laps_on_different_routes_are_409(two_routes):
    store, by_route = two_routes
    (circuit_laps, sprint_laps) = by_route.values()
    with pytest.raises(HTTPException) as err:
        corners_compare(_request(store), lap_a=circuit_laps[0]["id"], lap_b=sprint_laps[0]["id"])
    assert err.value.status_code == 409


def test_point_to_point_run_is_analysed_too(two_routes):
    """A sprint has no lap counter; it must still produce a trace and corners
    without raising, whatever clock it ends up timed on."""
    store, by_route = two_routes
    sprint = next(laps[0] for laps in by_route.values()
                  if store.get_session(laps[0]["session_id"])["route_kind"] == "sprint")
    trace = trace_of(store, sprint)
    assert trace.timing_source in {"game_lap_clock", "game_race_clock", "arrival_time"}
    route_id = store.get_session(sprint["session_id"])["route_id"]
    payload = route_corners(route_id, _request(store))
    assert payload["corners"], "the simulator's sprint road winds; it has corners"
    same = corners_compare(_request(store), lap_a=sprint["id"], lap_b=sprint["id"])
    assert same["totals"]["dt"] == 0
    # even a lap against itself is not declared comparable over HTTP
    assert same["comparable"] is False
    assert "route_equivalence_unverified" in same["reasons"]


def test_world_time_attack_laps_use_the_race_clock(tmp_path):
    """WTA broadcasts CurrentLap 0 for the whole event (upstream, verified on a
    real capture). The comparison must fall back to the race clock and say so."""
    def scenario(sim):
        sim.wta(3)
        sim.race_off()

    store = harness.run(scenario, tmp_path)
    laps = harness.completed_laps(store, harness.sessions(store)[0]["id"])
    assert len(laps) >= 2
    payload = corners_compare(_request(store), lap_a=laps[0]["id"], lap_b=laps[1]["id"])
    assert payload["a"]["timing_source"] == "game_race_clock"
    assert payload["b"]["timing_source"] == "game_race_clock"
    assert all(seg["time_a"] > 0 and seg["time_b"] > 0 for seg in payload["segments"])
