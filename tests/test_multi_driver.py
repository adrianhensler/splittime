"""Two-driver isolation and backwards-compatible storage checks (no network)."""
from __future__ import annotations
import json
import sqlite3

import pytest

from app.recorder.store import Store
from app.recorder.laps import SessionTracker
from app.telemetry.drivers import DriverScopedStore, load_drivers
from app.telemetry.packet import empty_fields, pack, parse


def specs():
    return load_drivers({"SPLITTIME_DRIVERS": json.dumps([
        {"id": "alpha", "name": "Driver Alpha", "udp_port": 19999},
        {"id": "beta", "name": "Driver Beta", "udp_port": 20000},
    ])})


def test_default_legacy_port_and_two_explicit_drivers():
    assert load_drivers({"TELEMETRY_UDP_PORT": "19999"})[0].id == "legacy"
    assert [d.udp_port for d in specs()] == [19999, 20000]


@pytest.mark.parametrize("value", [
    "not json", "{}", "[]",
    '[{"id":"a","name":"A","udp_port":9999},{"id":"b","name":"B","udp_port":9999}]',
    '[{"id":"a","name":"A","udp_port":5250}]',
    '[{"id":"a","name":"A","udp_port":false}]',
    '[{"id":"a","name":"A","udp_port":80}]',
    '[{"id":"bad id","name":"A","udp_port":9999}]',
])
def test_bad_config_fails_explicitly(value):
    with pytest.raises(ValueError):
        load_drivers({"SPLITTIME_DRIVERS": value})


def test_attributed_sessions_from_independent_trackers(tmp_path):
    store = Store(str(tmp_path / "recordings.db"))
    store.register_drivers(specs())
    trackers = {d.id: SessionTracker(DriverScopedStore(store, d.id)) for d in specs()}
    base = empty_fields()
    base.update(is_race_on=1, car_ordinal=42, car_class=3, car_pi=800,
                drivetrain_type=2, race_position=2, speed=50.0,
                norm_susp_travel=[0.5] * 4, tire_combined_slip=[0.3] * 4)
    for n in range(360):
        for ident, tracker in trackers.items():
            frame = {**base, "current_lap": (n + 1) / 60,
                     "current_race_time": (n + 1) / 60,
                     "distance_traveled": float(n + 1)}
            raw = pack(frame)
            tracker.on_frame(n / 60 + 1.0, raw, parse(raw))
    # Driver Alpha reaches a lap boundary while Beta continues its own clock.
    boundary = {**base, "lap_number": 1, "last_lap": 6.0,
                "current_race_time": 6.02, "distance_traveled": 361.0}
    raw = pack(boundary)
    trackers["alpha"].on_frame(7.01, raw, parse(raw))
    trackers["alpha"].shutdown(25.0)
    trackers["beta"].shutdown(25.0)
    sessions = {s["driver_id"]: s for s in store.list_sessions()}
    assert set(sessions) == {"alpha", "beta"}
    assert sessions["alpha"]["id"] != sessions["beta"]["id"]
    assert sessions["alpha"]["lap_count"] >= 1
    assert sessions["beta"]["lap_count"] == 0
    store.record_source(sessions["alpha"]["id"], "203.0.113.5:41234")
    assert store.get_session(sessions["alpha"]["id"])["source_addr"] == "203.0.113.5:41234"
    assert store.get_session(sessions["beta"]["id"])["source_addr"] is None
    store.close()


def test_old_single_driver_database_retains_identity(tmp_path):
    filename = str(tmp_path / "legacy.db")
    store = Store(filename)
    f = empty_fields()
    sid = store.create_session(1000.0, f)
    store.close()
    store = Store(filename)
    assert store.get_session(sid)["driver_id"] == "legacy"
    with sqlite3.connect(filename) as con:
        assert con.execute("PRAGMA user_version").fetchone()[0] == 2
    store.close()
