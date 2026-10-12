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
    # Each driver completes an independent lap, with different times.
    # Upstream intentionally discards a session with *no* completed lap when
    # it closes; M1 must not mistake that cleanup for a driver identity bug.
    for ident, elapsed in (("alpha", 6.0), ("beta", 6.2)):
        boundary = {**base, "lap_number": 1, "last_lap": elapsed,
                    "current_race_time": 6.25, "distance_traveled": 361.0}
        raw = pack(boundary)
        trackers[ident].on_frame(7.01, raw, parse(raw))
    trackers["alpha"].shutdown(25.0)
    trackers["beta"].shutdown(25.0)
    sessions = {s["driver_id"]: s for s in store.list_sessions()}
    assert set(sessions) == {"alpha", "beta"}
    assert sessions["alpha"]["id"] != sessions["beta"]["id"]
    assert sessions["alpha"]["lap_count"] >= 1
    assert sessions["beta"]["lap_count"] >= 1
    assert sessions["alpha"]["best_lap"] != sessions["beta"]["best_lap"]
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


def test_two_ports_same_source_and_size_counter(tmp_path):
    """Source address cannot choose driver; destination listener instance does."""
    from app.telemetry.hub import Hub
    from app.telemetry.listener import TelemetryProtocol

    store = Store(str(tmp_path / "duo.db"))
    store.register_drivers(specs())
    hubs = {d.id: Hub() for d in specs()}
    trackers = {d.id: SessionTracker(DriverScopedStore(store, d.id)) for d in specs()}
    listeners = {ident: TelemetryProtocol(hubs[ident], trackers[ident], ident)
                 for ident in ("alpha", "beta")}
    f = empty_fields()
    f.update(is_race_on=1, car_ordinal=11, car_class=3, car_pi=800,
             drivetrain_type=1)
    raw = pack(f)
    src = ("203.0.113.9", 40222)
    listeners["alpha"].datagram_received(raw, src)
    listeners["beta"].datagram_received(raw, src)
    listeners["beta"].datagram_received(b"bad", src)
    assert hubs["alpha"].packets_total == hubs["beta"].packets_total == 1
    assert hubs["beta"].bad_packets == 1 and hubs["alpha"].bad_packets == 0
    found = {row["driver_id"]: row for row in store.list_sessions()}
    assert set(found) == {"alpha", "beta"}
    assert found["alpha"]["source_addr"] == found["beta"]["source_addr"] == "203.0.113.9:40222"

    # The second driver's source port changes, but its driver identity does not.
    listeners["beta"].datagram_received(raw, ("203.0.113.9", 40223))
    found = {row["driver_id"]: row for row in store.list_sessions()}
    assert found["beta"]["source_addr"] == "203.0.113.9:40223"
    assert found["beta"]["id"] != found["alpha"]["id"]
    assert found["alpha"]["source_addr"] == "203.0.113.9:40222"
    for tracker in trackers.values():
        tracker.shutdown(999.0)
    store.close()


def test_status_lists_each_driver_and_protects_when_second_is_recording(tmp_path):
    import asyncio
    from types import SimpleNamespace
    from app.api.routes import status, sessions, _any_session_active
    from app.telemetry.hub import Hub

    store = Store(str(tmp_path / "status.db"))
    specs_now = specs()
    store.register_drivers(specs_now)
    trackers = {d.id: SessionTracker(DriverScopedStore(store, d.id)) for d in specs_now}
    hubs = {d.id: Hub() for d in specs_now}
    first = specs_now[0]
    state = SimpleNamespace(
        store=store, hub=hubs[first.id], tracker=trackers[first.id],
        udp_port=first.udp_port, udp_error=None, udp_errors={},
        drivers=specs_now, trackers=trackers, hubs=hubs,
    )
    request = SimpleNamespace(app=SimpleNamespace(state=state))
    data = asyncio.run(status(request))
    assert [row["udp_port"] for row in data["drivers"]] == [19999, 20000]

    f = empty_fields()
    f.update(is_race_on=1, car_ordinal=22, car_class=3, car_pi=800, drivetrain_type=1)
    raw = pack(f)
    trackers["beta"].on_frame(100.0, raw, parse(raw))
    assert trackers["alpha"].session_id is None
    assert _any_session_active(request)  # must not silently permit reprocess/VACUUM
    listed = sessions(request, driver_id="beta")
    assert len(listed) == 1 and listed[0]["driver_id"] == "beta"
    assert sessions(request, driver_id="alpha") == []
    for tracker in trackers.values():
        tracker.shutdown(150.0)
    store.close()


def test_websocket_host_gate_rejects_rebinding_name():
    from app.main import host_allowed, origin_allowed
    assert origin_allowed("https://attacker.invalid", "attacker.invalid")
    assert not host_allowed("attacker.invalid")
