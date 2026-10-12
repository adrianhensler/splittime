"""Collector and web as separate processes on one database (ADR 24).

What has to hold for the split to be safe: the web half never binds a driver's
port and never ends the collector's open session, the collector exposes
nothing that edits, two processes never hand out the same session id, and the
web half refuses a heavy write when it cannot confirm nothing is recording."""
from __future__ import annotations

import asyncio
import socket
import sqlite3
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.routing import Mount, WebSocketRoute

from app import roles
from app.api import routes
from app.main import create_app, lifespan
from app.recorder.store import Store
from app.telemetry.packet import empty_fields

UDP_A, UDP_B = 19999, 20000
DRIVERS = ('[{"id":"a","name":"A","udp_port":%d},{"id":"b","name":"B","udp_port":%d}]'
           % (UDP_A, UDP_B))


def _env(monkeypatch, tmp_path):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("SPLITTIME_DRIVERS", DRIVERS)
    monkeypatch.setenv("SPLITTIME_COLLECTOR_URL", "http://127.0.0.1:8101")
    monkeypatch.setenv("LS_OFFLINE", "1")


def _open_session(tmp_path) -> int:
    """A session a collector is in the middle of recording: no end, no laps."""
    store = Store(str(tmp_path / "telemetry.db"))
    try:
        sid = store.create_session(1000.0, empty_fields(), driver_id="legacy")
        store.add_frames(sid, [(1000.0, b"x"), (1001.0, b"y")])
        return sid
    finally:
        store.close()


def _ended_at(tmp_path, sid):
    with sqlite3.connect(tmp_path / "telemetry.db") as conn:
        return conn.execute("SELECT ended_at FROM sessions WHERE id = ?", (sid,)).fetchone()


def _run_lifespan(role, during=lambda: None):
    async def go():
        app = create_app(role)
        async with lifespan(app):
            during()
    asyncio.run(go())


def _udp_free(port) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.bind(("0.0.0.0", port))
        except OSError:
            return False
        return True


# -- configuration -----------------------------------------------------------

def test_role_defaults_to_all_and_rejects_unknown():
    assert roles.from_env({}) == roles.ALL
    assert roles.from_env({"SPLITTIME_ROLE": " Collector "}) == roles.COLLECTOR
    with pytest.raises(ValueError):
        roles.from_env({"SPLITTIME_ROLE": "recorder"})


@pytest.mark.parametrize("url", ["", "splittime-collector:8000", "ftp://x", "http://"])
def test_web_role_needs_a_collector_url(url):
    with pytest.raises(ValueError):
        roles.from_env({"SPLITTIME_ROLE": "web", "SPLITTIME_COLLECTOR_URL": url})


def test_web_role_accepts_a_collector_url():
    env = {"SPLITTIME_ROLE": "web", "SPLITTIME_COLLECTOR_URL": "http://c:8000/"}
    assert roles.from_env(env) == roles.WEB
    assert roles.collector_url(env) == "http://c:8000"


# -- startup -----------------------------------------------------------------

def test_web_start_leaves_the_collectors_open_session_alone(tmp_path, monkeypatch):
    _env(monkeypatch, tmp_path)
    sid = _open_session(tmp_path)
    _run_lifespan(roles.WEB)
    assert _ended_at(tmp_path, sid) == (None,)   # still recording, still there


def test_recording_roles_do_clean_up_at_start(tmp_path, monkeypatch):
    """The contrast that makes the test above mean something: a process that
    records treats an open session as a crash and removes this lapless one."""
    _env(monkeypatch, tmp_path)
    sid = _open_session(tmp_path)
    _run_lifespan(roles.COLLECTOR)
    assert _ended_at(tmp_path, sid) is None


def test_web_binds_no_udp_and_collector_binds_both(tmp_path, monkeypatch):
    _env(monkeypatch, tmp_path)
    seen = {}
    _run_lifespan(roles.WEB, lambda: seen.update(web=(_udp_free(UDP_A), _udp_free(UDP_B))))
    _run_lifespan(roles.COLLECTOR,
                  lambda: seen.update(collector=(_udp_free(UDP_A), _udp_free(UDP_B))))
    assert seen == {"web": (True, True), "collector": (False, False)}


# -- HTTP surface ------------------------------------------------------------

def _api(app) -> dict:
    """HTTP path -> methods, as the app itself documents them (the same on
    every FastAPI version, however it nests included routers)."""
    return {path: {m.upper() for m in ops} for path, ops in app.openapi()["paths"].items()}


def _has_route(app, kind, path) -> bool:
    return any(isinstance(r, kind) and r.path == path for r in app.routes)


def test_collector_serves_only_live_state():
    app = create_app(roles.COLLECTOR)
    assert _api(app) == {"/api/status": {"GET"}}           # nothing that changes data
    assert _has_route(app, WebSocketRoute, "/ws/live")
    assert not any(isinstance(r, Mount) for r in app.routes)   # no static pages
    assert {r.path for r in app.routes} == {"/api/status", "/ws/live"}  # no docs either


def test_web_and_all_serve_the_full_api():
    for role in (roles.WEB, roles.ALL):
        app = create_app(role)
        api = _api(app)
        assert {"/api/status", "/api/sessions", "/api/import/csv"} <= set(api)
        assert "DELETE" in api["/api/sessions/{session_id}"]
        assert _has_route(app, WebSocketRoute, "/ws/live")
        assert any(isinstance(r, Mount) for r in app.routes)


# -- session ids across two processes ----------------------------------------

def test_two_stores_on_one_file_never_share_a_session_id(tmp_path):
    db = str(tmp_path / "telemetry.db")
    collector, web = Store(db), Store(db)
    try:
        frame = empty_fields()
        ids = []
        for i in range(4):
            ids.append(collector.create_session(1000.0 + i, frame))
            ids.append(web.create_session(2000.0 + i, frame))
        assert ids == sorted(set(ids)) and len(ids) == 8
    finally:
        collector.close()
        web.close()


def test_a_deleted_top_id_stays_retired_across_restarts(tmp_path):
    db = str(tmp_path / "telemetry.db")
    store = Store(db)
    first = store.create_session(1000.0, empty_fields())
    top = store.create_session(1001.0, empty_fields())
    store.delete_session(top)
    store.close()

    store = Store(db)  # the other process, or this one after a restart
    try:
        assert store.create_session(1002.0, empty_fields()) == top + 1 > first
    finally:
        store.close()


def test_collector_never_waits_long_behind_a_web_write(tmp_path):
    """A web-side reprocess or import holds the write lock for its whole
    batch. The collector's flush must fail fast (its buffer is retried), not
    sit on the UDP loop for SQLite's default five seconds, and must succeed
    once the lock is gone with nothing half-written in between."""
    import time
    db = str(tmp_path / "telemetry.db")
    collector = Store(db, timeout=roles.COLLECTOR_BUSY_TIMEOUT_S)
    web = Store(db)
    try:
        sid = collector.create_session(1000.0, empty_fields())
        frames = [(1000.0 + i, b"f") for i in range(3)]
        with web.transaction():
            web.db.execute("UPDATE sessions SET name = 'held' WHERE id = ?", (sid,))
            began = time.monotonic()
            with pytest.raises(sqlite3.OperationalError):
                collector.add_frames(sid, frames)
            assert time.monotonic() - began < 2.0
        collector.add_frames(sid, frames)          # the tracker's retry
        with collector.reader() as conn:
            assert conn.execute("SELECT COUNT(*) FROM frames WHERE session_id = ?",
                                (sid,)).fetchone()[0] == 3
    finally:
        collector.close()
        web.close()


# -- the web half's guards ---------------------------------------------------

def _web_request(store):
    return SimpleNamespace(app=SimpleNamespace(
        state=SimpleNamespace(store=store, role=roles.WEB)))


def _collector_says(monkeypatch, status):
    def reply():
        if isinstance(status, Exception):
            raise status
        return status
    monkeypatch.setattr(roles, "collector_status", reply)


IDLE = {"session_id": None, "drivers": [{"id": "a", "session_id": None},
                                         {"id": "b", "session_id": None}]}


def _recording(sid):
    return {"session_id": None, "drivers": [{"id": "a", "session_id": None},
                                            {"id": "b", "session_id": sid}]}


@pytest.fixture
def store(tmp_path):
    s = Store(str(tmp_path / "telemetry.db"))
    yield s
    s.close()


def test_web_refuses_heavy_writes_while_any_driver_records(store, monkeypatch):
    sid = store.create_session(1000.0, empty_fields())
    other = store.create_session(1001.0, empty_fields())
    _collector_says(monkeypatch, _recording(other))
    request = _web_request(store)
    for call in (routes.reprocess(sid, request), routes.compact_storage(request)):
        with pytest.raises(HTTPException) as exc:
            asyncio.run(call)
        assert exc.value.status_code == 409


def test_web_delete_is_blocked_only_for_the_recording_session(store, monkeypatch):
    done = store.create_session(1000.0, empty_fields())
    live = store.create_session(1001.0, empty_fields())
    _collector_says(monkeypatch, _recording(live))
    request = _web_request(store)
    with pytest.raises(HTTPException) as exc:
        routes.delete_session(live, request)
    assert exc.value.status_code == 409
    assert routes.delete_session(done, request) == {"ok": True}
    assert store.get_session(live) is not None


def test_web_fails_closed_when_the_collector_is_silent(store, monkeypatch):
    sid = store.create_session(1000.0, empty_fields())
    _collector_says(monkeypatch, roles.CollectorUnavailable("refused"))
    request = _web_request(store)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(routes.reprocess(sid, request))
    assert exc.value.status_code == 503
    with pytest.raises(HTTPException) as exc:
        routes.delete_session(sid, request)
    assert exc.value.status_code == 503
    assert store.get_session(sid) is not None          # nothing was touched
    with pytest.raises(HTTPException) as exc:
        asyncio.run(routes.status(request))
    assert exc.value.status_code == 503


def test_web_allows_writes_when_the_collector_is_idle(store, monkeypatch):
    _collector_says(monkeypatch, IDLE)
    request = _web_request(store)
    assert asyncio.run(routes.compact_storage(request))["ok"] is True
    assert asyncio.run(routes.status(request)) == IDLE  # passed through as is


def test_collector_status_reports_an_unreachable_collector():
    with pytest.raises(roles.CollectorUnavailable):
        roles.collector_status("http://127.0.0.1:1", timeout=0.5)


def test_recording_ids_read_both_status_shapes():
    assert roles.recording_session_ids(IDLE) == set()
    assert roles.recording_session_ids(_recording(7)) == {7}
    assert roles.recording_session_ids({"session_id": 3}) == {3}   # one-driver upstream shape
