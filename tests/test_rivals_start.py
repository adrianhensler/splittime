"""Scalar signature from the owner's 2026-10-12 Rivals capture, no raw data.

Owner confirmed no rewind and a wall hit. During the approach, DistanceTraveled
is negative; CurrentLap counts up, then resets crossing zero while the race
clock continues. The old detector called that a rewind 0.05 s after launch.
"""
import pytest

from test_tracker import Driver


def approach(d):
    d.send(current_lap=0, current_race_time=0, distance_traveled=0)
    d.send(current_lap=2.4932, current_race_time=2.4932, distance_traveled=-0.087)


def test_rivals_first_start_line_reset_is_not_a_rewind_and_keeps_contact(tmp_path):
    d = Driver(tmp_path)
    approach(d)
    for i in range(1, 9):
        d.send(current_lap=i * 0.0114, current_race_time=2.4932 + i * .0114,
               distance_traveled=-.087 + i * .162, speed=14)
    assert "rewind" not in d.tracker._lap_flags
    assert d.tracker._lap_start_dist > 0
    d.send(current_lap=.2, distance_traveled=2, accel_x=100)
    assert "contact" in d.tracker._lap_flags
    d.send(current_lap=0, current_race_time=153.3007, lap_number=1,
           distance_traveled=5952.4648, last_lap=150.807556, best_lap=150.807556)
    laps = d.finish()
    lap = next(lap for lap in laps if lap["lap_number"] == 0)
    assert lap["flags"] == "contact"
    assert lap["lap_time"] == pytest.approx(150.807556, abs=.001)


def test_backward_race_clock_at_start_line_is_still_a_rewind(tmp_path):
    d = Driver(tmp_path)
    approach(d)
    d.send(current_lap=.12, current_race_time=.12, distance_traveled=.043)
    assert "rewind" in d.tracker._lap_flags
    d.finish()
