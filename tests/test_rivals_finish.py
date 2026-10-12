"""Scalar signature of the end of a Rivals lap, no raw data.

Seen identically on the owner's four 2026-10-12 captures: at the line
LapNumber goes 0 -> 1 and the game halts the car (speed 0, a 196 m/s^2
spike, odometer moving at most 5.8) for about 20 s with CurrentLap counting;
then LapNumber, DistanceTraveled and LastLap return to 0 and the car sits at
the start until the race clock restarts. Neither stretch is an attempt.
"""
import pytest

from test_tracker import Driver


def timed_lap(d: Driver, length: float = 5949.1, lap_time: float = 74.654) -> None:
    d.send(current_lap=0, distance_traveled=0)
    for i in range(1, 600):
        d.send(current_lap=i / 60, distance_traveled=i * length / 600, speed=50)
    d.send(current_lap=0, lap_number=1, distance_traveled=length, speed=0,
           last_lap=lap_time, best_lap=lap_time)


def held_at_line(d: Driver, length: float = 5949.1, frames: int = 300) -> None:
    d.send(current_lap=1 / 60, accel_x=196)        # the halt itself
    for i in range(2, frames):
        d.send(current_lap=i / 60, accel_x=0, distance_traveled=length + min(i, 90) * 5.8 / 90)


def test_post_finish_hold_and_reset_leave_only_the_timed_lap(tmp_path):
    d = Driver(tmp_path)
    timed_lap(d)
    held_at_line(d)
    assert "contact" in d.tracker._lap_flags       # flagged, on a lap about to go
    d.send(current_lap=0, lap_number=0, distance_traveled=0, last_lap=0, best_lap=0,
           race_position=0)
    for _ in range(200):
        d.send()
    laps = d.finish()
    assert [(lap["lap_number"], lap["flags"]) for lap in laps] == [(0, None)]
    assert laps[0]["lap_time"] == pytest.approx(74.654, abs=.001)


def test_stream_ending_during_the_hold_also_drops_it(tmp_path):
    d = Driver(tmp_path)
    timed_lap(d)
    held_at_line(d)
    assert len(d.finish()) == 1


def test_a_second_lap_that_is_actually_driven_is_kept_with_its_flag(tmp_path):
    d = Driver(tmp_path)
    timed_lap(d)
    d.send(current_lap=1 / 60, accel_x=196)
    for i in range(2, 300):
        d.send(current_lap=i / 60, accel_x=0, distance_traveled=5949.1 + i, speed=50)
    laps = d.finish()
    assert [(lap["lap_number"], lap["lap_time"] is None, lap["flags"]) for lap in laps] == [
        (0, False, None), (1, True, "contact")]


@pytest.mark.parametrize("moved", [10, 24, 26])
def test_a_short_lap_that_was_driven_is_kept(tmp_path, moved):
    """Reviewer's case on PR #19: quit, reset or lost telemetry a moment
    after the line. Short, but the car was moving, so it is an attempt."""
    d = Driver(tmp_path)
    timed_lap(d)
    for i in range(1, 61):
        d.send(current_lap=i / 60, distance_traveled=5949.1 + moved * i / 60,
               speed=moved, accel=200, accel_x=0)
    assert len(d.finish()) == 2


def test_the_hold_is_recognised_at_its_observed_creep_speed(tmp_path):
    """Throttle was held flat through the real holds; speed peaked at 3.0 m/s."""
    d = Driver(tmp_path)
    timed_lap(d)
    for i in range(1, 300):
        d.send(current_lap=i / 60, distance_traveled=5949.1 + min(i, 90) * 5.8 / 90,
               speed=3.0 if i == 40 else 0.1, accel=255)
    assert len(d.finish()) == 1


def test_a_parked_first_lap_is_not_dropped(tmp_path):
    """Only laps after a timed one: an untimed session is discarded whole by
    the existing rule, and its diagnostics should not change."""
    d = Driver(tmp_path)
    d.send(current_lap=0, distance_traveled=0)
    for i in range(1, 120):
        d.send(current_lap=i / 60)
    assert d.tracker._drop_parked_lap() is False
    d.finish()
