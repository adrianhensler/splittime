"""Scalar signature of the end of a Rivals lap, no raw data.

Seen identically on the owner's four 2026-10-12 captures: at the line
LapNumber goes 0 -> 1 and the game halts the car (speed 0, a 196 m/s^2
spike, odometer moving at most 5.8) for about 20 s with CurrentLap counting;
then LapNumber, DistanceTraveled and LastLap return to 0 and the car sits at
the start until the race clock restarts. Neither stretch is an attempt.

Only that signature is dropped. A lap after a timed one that is merely slow,
short or stationary, with no halt spike, may be an attempt the driver gave up
at the line: it is kept, however it ends.
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


def creep(d: Driver, halt: float) -> None:
    for i in range(1, 300):
        d.send(current_lap=i / 60, distance_traveled=5949.1 + min(i, 90) * 5.8 / 90,
               speed=3.0 if i == 40 else 0.1, accel=255, accel_x=halt if i == 1 else 0)


def test_the_hold_is_recognised_at_its_observed_creep_speed(tmp_path):
    """Throttle was held flat through the real holds; speed peaked at 3.0 m/s."""
    d = Driver(tmp_path)
    timed_lap(d)
    creep(d, halt=196)
    assert len(d.finish()) == 1


def test_the_same_creep_without_the_halt_spike_is_kept(tmp_path):
    """Movement and speed alone do not identify a hold (PR #19 review)."""
    d = Driver(tmp_path)
    timed_lap(d)
    creep(d, halt=0)
    assert [lap["lap_time"] is None for lap in d.finish()] == [False, True]


def slow_attempt(d: Driver, speed: float) -> None:
    for i in range(1, 121):
        d.send(current_lap=i / 60, distance_traveled=5949.1 + speed * i / 60,
               pos_x=speed * i / 60, speed=speed, accel=200, accel_x=0)


def reset_to_start(d: Driver) -> None:
    d.send(current_lap=0, lap_number=0, distance_traveled=0, last_lap=0, best_lap=0,
           race_position=0, pos_x=0, speed=0, accel=0)
    for _ in range(200):
        d.send()


SLOW = [0.0, 1.0, 4.0, 4.99]    # 0.0: never moved at all


@pytest.mark.parametrize("speed", SLOW)
def test_a_slow_attempt_is_kept_when_telemetry_ends(tmp_path, speed):
    """Reviewer's cases on PR #19 at 560aa52: under 5 m/s and under 25 units,
    so the movement-and-speed rule deleted all of them."""
    d = Driver(tmp_path)
    timed_lap(d)
    slow_attempt(d, speed)
    laps = d.finish()
    assert [(lap["lap_number"], lap["flags"]) for lap in laps] == [(0, None), (1, None)]
    assert laps[0]["lap_time"] == pytest.approx(74.654, abs=.001)
    assert laps[1]["lap_time"] is None


@pytest.mark.parametrize("speed", SLOW)
def test_a_slow_attempt_is_kept_when_the_game_resets(tmp_path, speed):
    """Nor is the stretch after it dropped: a wait at the start is only
    recognised as what a recognised hold hands over to."""
    d = Driver(tmp_path)
    timed_lap(d)
    slow_attempt(d, speed)
    reset_to_start(d)
    laps = d.finish()
    assert [lap["lap_time"] is None for lap in laps] == [False, True, True]
    assert laps[0]["lap_time"] == pytest.approx(74.654, abs=.001)


def test_a_slow_attempt_is_kept_when_the_race_clock_restarts(tmp_path):
    """The restart splits the session; the attempt stays in the first one."""
    d = Driver(tmp_path)
    timed_lap(d)
    slow_attempt(d, 4.0)
    d.send(current_race_time=0)
    assert [lap["lap_time"] is None for lap in d.store.session_laps(1)] == [False, True]
    d.finish()


def test_a_hold_that_ends_at_a_race_clock_restart_is_dropped(tmp_path):
    d = Driver(tmp_path)
    timed_lap(d)
    held_at_line(d)
    d.send(current_race_time=0)
    assert [lap["lap_time"] for lap in d.store.session_laps(1)] == [
        pytest.approx(74.654, abs=.001)]
    d.finish()


def test_a_counter_reset_without_the_odometer_reset_is_not_a_wait(tmp_path):
    """After a hold, LapNumber falling back with the odometer still on the
    lap is not the game returning the car to the start; keep what follows."""
    d = Driver(tmp_path)
    timed_lap(d)
    held_at_line(d)
    d.send(current_lap=0, lap_number=0)
    for _ in range(200):
        d.send()
    assert [lap["lap_time"] is None for lap in d.finish()] == [False, True]


def test_a_lap_driven_off_after_the_reset_is_kept(tmp_path):
    d = Driver(tmp_path)
    timed_lap(d)
    held_at_line(d)
    d.send(current_lap=0, lap_number=0, distance_traveled=0, last_lap=0, best_lap=0)
    for i in range(1, 300):
        d.send(current_lap=i / 60, distance_traveled=i, speed=50)
    assert [lap["lap_time"] is None for lap in d.finish()] == [False, True]


def test_an_attempt_after_an_unsplit_clock_restart_is_kept(tmp_path):
    """A restart landing at 5 s or later does not split the session, so the
    wait would run on into the next attempt; that attempt is kept."""
    d = Driver(tmp_path)
    timed_lap(d)
    held_at_line(d)
    reset_to_start(d)
    d.send(current_race_time=6.0)
    for i in range(1, 121):
        d.send(distance_traveled=4.0 * i / 60, speed=4.0, accel=200)
    assert [lap["lap_time"] is None for lap in d.finish()] == [False, True]


def test_crossing_the_line_and_carrying_on_is_untouched(tmp_path):
    """No hold: two timed laps and the open third, times as the game posted."""
    d = Driver(tmp_path)
    d.send(current_lap=0, distance_traveled=0)
    for lap, posted in enumerate([74.654, 73.211]):
        for i in range(1, 600):
            d.send(current_lap=i / 60, distance_traveled=(lap + i / 600) * 5949.1, speed=50)
        d.send(current_lap=0, lap_number=lap + 1, distance_traveled=(lap + 1) * 5949.1,
               last_lap=posted, best_lap=min(74.654, posted))
    for i in range(1, 60):
        d.send(current_lap=i / 60, distance_traveled=2 * 5949.1 + i, speed=50)
    laps = d.finish()
    assert [(lap["lap_number"], lap["flags"]) for lap in laps] == [
        (0, None), (1, None), (2, None)]
    assert [lap["lap_time"] for lap in laps] == [
        pytest.approx(74.654, abs=.001), pytest.approx(73.211, abs=.001), None]


def test_dropping_the_hold_leaves_every_frame_stored(tmp_path):
    d = Driver(tmp_path)
    timed_lap(d)
    held_at_line(d)
    sent = d.tracker._frame_count
    d.tracker.shutdown(d.t + 20.0)
    with d.store.reader() as conn:
        assert conn.execute("SELECT COUNT(*) FROM frames").fetchone()[0] == sent
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
