"""Event-type guessing (the game sends no mode) and keeping sender addresses
out of API responses."""
from __future__ import annotations

import json
import random
from types import SimpleNamespace

import harness
from app.api.routes import group_laps, lap_data, session_laps, sessions
from app.eventtype import classify, guess_event, start_signature
from app.rivalry import rivalry_summary
from test_tracker import Driver


def rivals_start(d: Driver, position: int = 1) -> None:
    """Scalar signature of the owner's 2026-10-12 Rivals capture: the lap
    clock counts on the approach, then resets at the line."""
    d.send(current_lap=0, current_race_time=0, distance_traveled=-35.0,
           race_position=position, speed=14)
    for i in range(1, 150):
        d.send(current_lap=i / 60, distance_traveled=-35.0 + i * 0.234, speed=14)
    for i in range(1, 240):
        d.send(current_lap=i / 60, distance_traveled=0.06 + i * 0.234, speed=14)


def finish(d: Driver) -> dict:
    d.send(current_lap=0, lap_number=1, distance_traveled=5952.0,
           last_lap=150.8, best_lap=150.8)
    d.tracker.shutdown(d.t + 20.0)
    return d.store.list_sessions()[0]


def test_rivals_start_signature_is_guessed_as_rivals(tmp_path):
    d = Driver(tmp_path)
    rivals_start(d)
    guess = guess_event(d.store, finish(d))
    assert guess["kind"] == "rivals" and guess["basis"] == "guess"
    assert guess["evidence"]["start_clock_reset"] is True
    assert guess["evidence"]["race_positions"] == [1]
    assert guess["evidence"]["approach_seconds"] > 2


def test_another_car_ahead_at_any_point_rules_rivals_out(tmp_path):
    d = Driver(tmp_path)
    rivals_start(d)
    d.send(race_position=3)
    d.send(race_position=1)
    assert guess_event(d.store, finish(d))["kind"] == "race"


def test_grid_start_without_a_clock_reset_is_unknown_not_rivals(tmp_path):
    """Leading a race from the grid looks like position 1 throughout. That is
    not evidence of Rivals, so the answer must stay unknown."""
    d = Driver(tmp_path)
    d.send(current_lap=0, current_race_time=0, distance_traveled=-35.0, race_position=1)
    for i in range(1, 400):
        d.send(current_lap=i / 60, distance_traveled=-35.0 + i * 0.234, speed=14)
    guess = guess_event(d.store, finish(d))
    assert guess["kind"] == "unknown"
    assert guess["evidence"]["start_clock_reset"] is False


def test_simulated_events_are_never_called_rivals(tmp_path):
    random.seed(4)

    def scenario(sim):
        sim.event(100, "circuit")
        sim.race_off()

    store = harness.run(scenario, tmp_path)
    session = harness.sessions(store)[0]
    guess = guess_event(store, session)
    assert guess["kind"] in {"race", "unknown"}
    assert guess["evidence"]["start_clock_reset"] is None   # never below zero distance


def test_pure_rules():
    assert start_signature([]) == (None, 0.0)
    assert classify(set(), None, 0.0)["kind"] == "unknown"
    assert classify({0}, True, 2.5)["kind"] == "rivals"     # 0 = position not reported
    assert classify({1, 2}, True, 2.5)["kind"] == "race"


def test_rivalry_attempts_carry_the_guess_and_say_it_is_one(tmp_path):
    d = Driver(tmp_path)
    rivals_start(d)
    finish(d)
    category = rivalry_summary(d.store)["categories"][0]
    attempt = category["attempts"][0]
    assert attempt["event_mode"] == "rivals"
    assert attempt["event_mode_basis"] == "guess"
    assert "game_mode_is_a_guess" in category["uncertainty"]
    assert category["winner"] is None


def test_sender_address_never_reaches_a_browser(tmp_path):
    """The pages may be public; a driver's home IP must stay in the database."""
    d = Driver(tmp_path)
    rivals_start(d)
    session = finish(d)
    d.store.record_source(session["id"], "203.0.113.77:51234")
    assert d.store.get_session(session["id"])["source_addr"] == "203.0.113.77:51234"
    gid = d.store.create_group("g", session["route_id"], session["car_ordinal"],
                               [session["id"]])
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(
        store=d.store, tracker=None, trackers={}, drivers=())))
    lap_id = d.store.session_laps(session["id"])[0]["id"]
    payloads = [sessions(request), session_laps(session["id"], request),
                group_laps(gid, request), rivalry_summary(d.store),
                lap_data(lap_id, request, channels="speed_kmh", max_points=100)]
    text = json.dumps(payloads)
    assert "203.0.113.77" not in text and "source_addr" not in text
