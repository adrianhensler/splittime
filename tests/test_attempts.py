"""Attempts: every started event counts, finished or given up.

Owner decision 2026-10-13: a session with no timed lap is still discarded,
but drivers want their number of attempts, and ten restarts are ten attempts.
"""
from types import SimpleNamespace

import pytest

from app.attempts import UNKNOWN, attempt_summary, route_of_start
from app.recorder import laps as laps_module
from app.recorder.reprocess import reprocess_session
from app.recorder.store import Store
from app.stats import stats_summary
from harness import run, sessions


def reopen(closed: Store) -> Store:
    return Store(closed.db_path)


def test_given_up_run_is_discarded_but_counted(tmp_path):
    store = reopen(run(lambda sim: sim.dirt_sprint(60, cut=True, quit_after=20), tmp_path))
    assert sessions(store) == []
    rows = store.list_attempts()
    assert len(rows) == 1
    assert rows[0]["driver_id"] == "legacy" and rows[0]["car_ordinal"]
    assert 500 < rows[0]["covered"] < 5861
    summary = attempt_summary(store)
    assert summary["drivers"]["legacy"] == {"finished": 0, "abandoned": 1, "attempts": 1}
    assert summary["routes"][0]["route_name"] == UNKNOWN
    store.close()


def test_ten_attempts_are_ten_attempts(tmp_path):
    def scenario(sim):
        for _ in range(9):
            sim.dirt_sprint(60, cut=True, quit_after=12)  # restarted in the first corners
        sim.dirt_sprint(40)                               # the tenth one finishes

    store = reopen(run(scenario, tmp_path))
    summary = attempt_summary(store)
    assert summary["drivers"]["legacy"] == {"finished": 1, "abandoned": 9, "attempts": 10}
    # the nine start where the finished run's route starts, so they join it
    assert [(r["route_id"] is not None, r["drivers"]["legacy"]["attempts"])
            for r in summary["routes"]] == [(True, 10)]
    store.close()


def test_free_roam_is_not_an_attempt(tmp_path):
    store = reopen(run(lambda sim: sim.freeroam(30), tmp_path))
    assert sessions(store) == [] and store.list_attempts() == []
    store.close()


def test_a_kept_session_is_counted_once(tmp_path, monkeypatch):
    monkeypatch.setattr(laps_module, "KEEP_DISCARDED", True)
    store = reopen(run(lambda sim: sim.dirt_sprint(60, cut=True, quit_after=20), tmp_path))
    assert len(store.list_sessions()) == 1 and len(store.list_attempts()) == 1
    assert attempt_summary(store)["drivers"]["legacy"]["attempts"] == 1
    # replaying it leaves one row, not two
    sid = store.list_sessions()[0]["id"]
    assert reprocess_session(store, sid) == 0
    assert [a["session_id"] for a in store.list_attempts()] == [sid]
    store.close()


def test_start_position_picks_the_route(monkeypatch):
    routes = [{"id": 4, "name": "Ito Sprint", "start_x": 0.0, "start_z": 0.0},
              {"id": 9, "name": None, "start_x": 5000.0, "start_z": 0.0},
              {"id": 11, "name": "Twin A", "start_x": 9000.0, "start_z": 0.0},
              {"id": 12, "name": "Twin B", "start_x": 9010.0, "start_z": 0.0}]
    monkeypatch.setattr("app.attempts.tracks.TRACKS", {"hokubu-ascent": {
        "key": "hokubu-ascent", "name": "Hokubu Ascent",
        "start_x": 1022.8, "start_z": 4073.1}})
    assert route_of_start(60.0, 40.0, routes) == (4, "Ito Sprint")
    assert route_of_start(5001.0, 0.0, routes) == (9, "Unnamed route #9")
    assert route_of_start(9005.0, 0.0, routes) == (None, UNKNOWN)      # shared start line
    assert route_of_start(1020.1, 4013.0, routes) == ("catalog:hokubu-ascent", "Hokubu Ascent")
    assert route_of_start(-7000.0, -7000.0, routes) == (None, UNKNOWN)
    assert route_of_start(None, None, routes) == (None, UNKNOWN)


def test_stats_has_an_attempts_section(tmp_path):
    def scenario(sim):
        sim.dirt_sprint(60, cut=True, quit_after=20)
        sim.dirt_sprint(40)

    store = reopen(run(scenario, tmp_path))
    data = stats_summary(store, [SimpleNamespace(id="legacy", name="Driver")])
    section = next(s for s in data["sections"] if s["id"] == "attempts")
    totals = {row[0]: row[1]["value"] for row in section["tables"][0]["rows"]}
    assert totals == {"Attempts": 2, "Finished": 1, "Given up": 1,
                      "Finish rate": pytest.approx(0.5)}
    assert section["tables"][1]["rows"][0][1:] == [
        {"kind": "int", "value": 2}, {"kind": "int", "value": 1}]
    store.close()


def test_a_restart_inside_ten_seconds_is_not_yet_seen_as_a_new_start(tmp_path):
    """Known gap, kept visible: the recorder splits a session when the race
    clock jumps back by more than RACE_TIME_RESET_JUMP (10 s). A restart
    sooner than that stays inside the same session, so it is one attempt.
    Telling it from a rewind needs a real capture of one."""
    def scenario(sim):
        sim.dirt_sprint(60, cut=True, quit_after=3)   # clock at 7 s: no split
        sim.dirt_sprint(60, cut=True, quit_after=12)

    store = reopen(run(scenario, tmp_path))
    assert attempt_summary(store)["drivers"]["legacy"]["attempts"] == 1
    store.close()
