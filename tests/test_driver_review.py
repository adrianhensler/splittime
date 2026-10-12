"""Adverse regressions for the independently reported PR #6 defects."""
import json
import logging
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.routes import GroupCreate, GroupMember, add_group_session, create_group, group_laps
from app.recorder.store import Store
from app.telemetry.drivers import load_drivers
from app.telemetry.hub import Hub
from app.telemetry.listener import TelemetryProtocol
from app.telemetry.packet import empty_fields, pack


def config(*pairs):
    return load_drivers({"SPLITTIME_DRIVERS": json.dumps([
        {"id": ident, "name": ident, "udp_port": port} for ident, port in pairs])})


@pytest.mark.parametrize("pairs", [
    [("a", 20000), ("b", 19999)],  # swapped
    [("a", 19999), ("c", 20000)],  # removed id's port reused
    [("renamed", 19999), ("b", 20000)],
])
def test_reconfigure_ports_preserves_historical_drivers(tmp_path, pairs):
    store = Store(str(tmp_path / "config.db"))
    try:
        store.register_drivers(config(("a", 19999), ("b", 20000)))
        sid = store.create_session(1, empty_fields(), driver_id="a")
        store.register_drivers(config(*pairs))
        with store.reader() as conn:
            rows = dict(conn.execute("SELECT id, udp_port FROM drivers"))
        assert {ident: port for ident, port in rows.items() if port is not None} == dict(pairs)
        assert "a" in rows and store.get_session(sid)["driver_id"] == "a"
    finally:
        store.close()


def driver_store(tmp_path):
    store = Store(str(tmp_path / "groups.db"))
    store.register_drivers(config(("a", 19999), ("b", 20000)))
    store.db.execute("INSERT INTO routes(id,start_x,start_z,lap_length) VALUES(17,0,0,1000)")
    ids = [store.create_session(i + 1, empty_fields(), driver_id=d)
           for i, d in enumerate(("a", "a", "b"))]
    store.db.execute("UPDATE sessions SET route_id=17, car_ordinal=269")
    store.db.commit()
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(store=store)))
    return store, ids, request


def test_group_creation_and_membership_cannot_mix_drivers(tmp_path):
    store, ids, req = driver_store(tmp_path)
    try:
        with pytest.raises(HTTPException, match="same driver"):
            create_group(GroupCreate(session_ids=[ids[0], ids[2]]), req)
        gid = create_group(GroupCreate(session_ids=ids[:2]), req)["group"]["id"]
        with pytest.raises(HTTPException, match="same driver"):
            add_group_session(gid, GroupMember(session_id=ids[2]), req)
        assert store.get_session(ids[2])["group_id"] is None
    finally:
        store.close()


def test_old_mixed_group_is_not_scored_or_rewritten(tmp_path):
    store, ids, req = driver_store(tmp_path)
    try:
        gid = store.create_group("old mixed", 17, 269, [ids[0], ids[2]])
        with pytest.raises(HTTPException, match="different drivers") as error:
            group_laps(gid, req)
        assert error.value.status_code == 409
        assert len(store.group_sessions(gid)) == 2
    finally:
        store.close()


def test_alternating_source_writes_and_logs_are_bounded(monkeypatch, caplog):
    writes = []
    tracker = SimpleNamespace(store=SimpleNamespace(record_source=lambda *args: writes.append(args)),
                              on_frame=lambda *args: {"session_id": 1})
    clock = [0.0]
    monkeypatch.setattr("app.telemetry.listener.time.time", lambda: clock[0])
    monkeypatch.setattr("app.telemetry.listener.time.monotonic", lambda: clock[0])
    listener = TelemetryProtocol(Hub(), tracker, "a")
    packet = pack(empty_fields())
    with caplog.at_level(logging.WARNING, logger="lapscope.udp"):
        for i in range(600):
            clock[0] = i / 60
            listener.datagram_received(packet, ("203.0.113.1", 40000 + i % 2))
    assert len(writes) <= 3
    assert len(caplog.records) <= 3
    assert writes[0] == (1, "203.0.113.1:40000")
    assert listener.hub.source_changes == 599
    listener.sources.sync_session(None, 10)
    assert writes[-1] == (1, "203.0.113.1:40001")
    assert len(writes) <= 3


def test_invalid_registration_rolls_back_all_port_assignments(tmp_path):
    store = Store(str(tmp_path / "rollback.db"))
    try:
        store.register_drivers(config(("a", 19999), ("b", 20000)))
        with pytest.raises(Exception, match="UNIQUE"):
            store.register_drivers([SimpleNamespace(id="a", name="A", udp_port=19999),
                                    SimpleNamespace(id="c", name="C", udp_port=19999)])
        with store.reader() as conn:
            assert dict(conn.execute("SELECT id, udp_port FROM drivers WHERE udp_port IS NOT NULL")) == {
                "a": 19999, "b": 20000}
    finally:
        store.close()


def test_source_write_failures_are_rate_limited_and_retry(monkeypatch, caplog):
    from app.telemetry.sources import SourceTracker

    calls = []
    def record(*args):
        calls.append(args)
        if len(calls) == 1:
            raise OSError("disk full")
    sources = SourceTracker(SimpleNamespace(record_source=record), Hub(), "a")
    with caplog.at_level(logging.ERROR, logger="lapscope.udp"):
        for i in range(600):
            sources.observe(1, "203.0.113.1:40000", i / 60)
    assert len(calls) == 2 and len(caplog.records) == 1
