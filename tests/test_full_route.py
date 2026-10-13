"""A gridded point-to-point race is only finished at the far end.

Two real captures, 2026-10-13, same driver and course. Both were given up
partway and both were timed as finished runs, and because their odometer
lengths matched no route, each became an unnamed route of its own:

- 69% round: the car was still rolling (22 km/h) when the stream stopped,
  which met every test of the last-packet recovery.
- 42% round: the car sat at 1.3 m/s, the stream gapped 5.5 s with the race
  clock still, and came back with the odometer at 0 and the car in the same
  place, which read as the finish handback.

FH6's odometer reads about 5950 at the end of any completed route, so the
distance says which runs finished.
"""
import pytest

from app.recorder import laps as laps_module
from app.recorder.laps import FULL_ROUTE_MIN
from app.recorder.reprocess import reprocess_session
from app.recorder.store import Store
from harness import completed_laps, flags_of, route_of, run, sessions
from test_tracker import Driver


def routes(store: Store) -> list:
    with store.reader() as conn:
        return conn.execute("SELECT id FROM routes").fetchall()


def test_simulated_sprints_read_the_games_odometer(tmp_path):
    """The simulator normalises a sprint's odometer the way the game does,
    so a finished run fingerprints at about 5950 whatever its real length."""
    store = run(lambda sim: sim.dirt_sprint(40), tmp_path)
    route = route_of(store, sessions(store)[0]["id"])
    assert route["lap_length"] == pytest.approx(5950.0, rel=0.005)


def test_run_given_up_while_rolling_is_not_timed(tmp_path):
    store = run(lambda sim: sim.dirt_sprint(60, cut=True, quit_after=41), tmp_path)
    assert sessions(store) == []       # no timed run: discarded like any abandoned event
    assert routes(store) == []


def test_full_run_cut_at_the_line_is_still_timed(tmp_path):
    store = run(lambda sim: sim.dirt_sprint(60, cut=True), tmp_path)
    ss = sessions(store)
    timed = completed_laps(store, ss[0]["id"])
    assert len(timed) == 1 and "cutoff" in flags_of(timed[0])
    assert route_of(store, ss[0]["id"])["lap_length"] >= FULL_ROUTE_MIN


def gridded_run(d: Driver, covered: float, seconds: float = 60.0) -> None:
    """Grid hold at odometer 0 (clock counting), then a run to `covered`."""
    d.f.update(race_position=8)
    for _ in range(240):
        d.send(current_lap=d.f["current_race_time"], distance_traveled=0, speed=0)
    n = int(seconds * 60)
    for i in range(1, n + 1):
        d.send(current_lap=d.f["current_race_time"], speed=50,
               distance_traveled=covered * i / n, pos_x=float(i))


def odometer_reset_after_a_gap(d: Driver) -> None:
    """The car slows to a crawl, the stream gaps with the clock still, and
    the odometer comes back at 0 with the car where it was."""
    d.send(current_lap=d.f["current_race_time"], speed=1.3)
    clock = d.f["current_race_time"]
    d.send(dt=5.5, current_race_time=clock - 5.5, current_lap=clock,
           distance_traveled=0, speed=1.3)
    for i in range(1, 40):
        d.send(current_lap=i / 60, distance_traveled=i * 1.8, speed=0.5)


def test_odometer_reset_partway_round_is_not_a_finish(tmp_path):
    d = Driver(tmp_path)
    gridded_run(d, covered=2483.0)
    odometer_reset_after_a_gap(d)
    assert not d.tracker._event_finished
    store = d.store
    assert d.finish() == []            # the session had no timed run and is gone
    assert Store(store.db_path).list_sessions() == []


def test_odometer_reset_at_the_far_end_is_a_finish(tmp_path):
    d = Driver(tmp_path)
    gridded_run(d, covered=5951.0)
    odometer_reset_after_a_gap(d)
    timed = [lap for lap in d.finish() if lap["lap_time"]]
    assert len(timed) == 1
    assert timed[0]["lap_time"] == pytest.approx(60.0, abs=0.1)
    assert "cutoff" not in (timed[0]["flags"] or "")


def frozen_clock(d: Driver, seconds: float = 3.0) -> None:
    clock = d.f["current_race_time"]
    for _ in range(int(seconds * 60)):
        d.send(current_race_time=clock, current_lap=clock, speed=0)


def test_clock_freezing_partway_round_is_not_a_finish(tmp_path):
    d = Driver(tmp_path)
    gridded_run(d, covered=2483.0)
    frozen_clock(d)
    assert d.tracker._event_finished   # the freeze still ends race mode
    assert d.finish() == []


def test_clock_freezing_at_the_far_end_is_a_finish(tmp_path):
    d = Driver(tmp_path)
    gridded_run(d, covered=5951.0)
    frozen_clock(d)
    d.send(distance_traveled=0)        # the handback resets the odometer afterwards
    timed = [lap for lap in d.finish() if lap["lap_time"]]
    assert len(timed) == 1
    assert timed[0]["lap_time"] == pytest.approx(60.0, abs=0.1)


def test_reprocess_drops_the_route_of_a_run_that_no_longer_counts(tmp_path, monkeypatch):
    """A recording made before this rule keeps its packets; replaying it must
    leave the session on no route, not on the one the old rule invented."""
    monkeypatch.setattr(laps_module, "KEEP_DISCARDED", True)
    closed = run(lambda sim: sim.dirt_sprint(60, cut=True, quit_after=41), tmp_path)
    store = Store(closed.db_path)
    sid = store.list_sessions()[0]["id"]
    stale = store.match_or_create_route(0.0, 0.0, 4080.0, 500.0, 400.0)
    store.set_session_route(sid, stale)

    assert reprocess_session(store, sid) == 0
    assert store.get_session(sid)["route_id"] is None
    store.close()
