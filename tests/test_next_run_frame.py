"""A lap's last frame can be the first frame of the next run. Everything that
reads the lap must see the lap as it was driven, not a rewind to the start."""

from __future__ import annotations

import pytest

from app.api.routes import _LapScan
from app.corners.trace import build_trace, samples_from_rows
from app.recorder.store import Store, is_next_run_frame
from app.rivalry import lap_covered
from app.telemetry.packet import empty_fields, pack


def frame(dist: float, clock: float) -> bytes:
    fields = empty_fields()
    fields.update(distance_traveled=dist, current_lap=clock)
    return pack(fields)


@pytest.mark.parametrize("prev, last, stray", [
    ((5952.0, 164.3), (55.6, 0.0), True),      # a restart: back at the start, clock reset
    ((5952.0, 164.3), (5953.0, 0.0), False),   # an ordinary crossing frame
    ((5952.0, 164.3), (5900.0, 160.0), False),  # a real rewind: the clock is still running
    ((5952.0, 0.0), (55.6, 0.0), False),       # no lap clock in this event
])
def test_is_next_run_frame(prev, last, stray):
    assert is_next_run_frame(frame(*prev), frame(*last)) is stray


def recorded(tmp_path, last: bytes, frames: int = 3000):
    store = Store(str(tmp_path / "t.db"))
    fields = empty_fields()
    sid = store.create_session(100.0, fields)
    lid = store.add_lap(sid, 0, 100.0, 0)
    rows = [(100.0 + i / 60, frame(i * 2.0, i / 60)) for i in range(frames)]
    end = rows[-1][0] + 10
    store.add_frames(sid, rows + [(end, last)])
    store.complete_lap(lid, end, frames / 60)
    return store, next(lap for lap in store.session_laps(sid) if lap["id"] == lid)


def test_a_stray_last_frame_does_not_cost_the_end_of_the_lap(tmp_path):
    store, lap = recorded(tmp_path, frame(55.6, 0.0))
    try:
        rows = store.lap_frames(lap)
        assert len(rows) == 3000
        last_dist = 2999 * 2.0
        assert list(_LapScan(rows, 0.0))[-1][1] == last_dist
        assert build_trace(samples_from_rows(rows), start_distance=0.0).s[-1] == last_dist
        assert lap_covered(store, lap) == last_dist
    finally:
        store.close()


def test_an_ordinary_crossing_frame_stays(tmp_path):
    store, lap = recorded(tmp_path, frame(6000.0, 0.0))
    try:
        assert len(store.lap_frames(lap)) == 3001
        assert lap_covered(store, lap) == 6000.0
    finally:
        store.close()
