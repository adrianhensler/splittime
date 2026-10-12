"""LapScope server: UDP telemetry in, web dashboard + API out."""

from __future__ import annotations

import asyncio
import ipaddress
import logging
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import FastAPI, Response, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

from . import cars, tracks
from .api.routes import router
from .recorder.laps import SessionTracker
from .recorder.store import Store
from .telemetry.hub import Hub
from .telemetry.drivers import DriverScopedStore, load_drivers
from .telemetry.listener import TelemetryProtocol

log = logging.getLogger("lapscope")


async def _watchdog(tracker: SessionTracker) -> None:
    while True:
        await asyncio.sleep(1.0)
        try:
            tracker.tick(time.time())
        except Exception:
            log.exception("watchdog tick failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    data_dir = os.environ.get("DATA_DIR", "./data")
    drivers = load_drivers()

    cars.load(data_dir)
    tracks.load(data_dir)
    store = Store(os.path.join(data_dir, "telemetry.db"))
    store.register_drivers(drivers)
    removed = store.cleanup_sessions()
    if removed:
        log.info("Startup cleanup: removed %d untimed session(s)", removed)

    hubs = {d.id: Hub() for d in drivers}
    trackers = {d.id: SessionTracker(DriverScopedStore(store, d.id)) for d in drivers}
    first = drivers[0]
    app.state.store = store
    app.state.drivers = drivers
    app.state.hubs = hubs
    app.state.trackers = trackers
    # Compatibility: legacy endpoints and upstream dashboard default to first driver.
    app.state.hub = hubs[first.id]
    app.state.tracker = trackers[first.id]
    app.state.udp_port = first.udp_port
    app.state.udp_error = None
    app.state.udp_errors = {}

    loop = asyncio.get_running_loop()
    transports = []
    watchdogs = []
    try:
        for d in drivers:
            try:
                transport, _ = await loop.create_datagram_endpoint(
                    lambda d=d: TelemetryProtocol(hubs[d.id], trackers[d.id], d.id),
                    local_addr=("0.0.0.0", d.udp_port),
                )
                transports.append(transport)
                log.info("Driver %s (%s) listening on UDP %d", d.id, d.name, d.udp_port)
            except OSError as exc:
                message = f"UDP {d.udp_port} for driver {d.id} cannot bind: {exc}"
                app.state.udp_errors[d.id] = message
                if d.id == first.id:
                    app.state.udp_error = message
                log.error(message)
        watchdogs = [asyncio.create_task(_watchdog(t)) for t in trackers.values()]
        yield
    finally:
        for watchdog in watchdogs:
            watchdog.cancel()
        for transport in transports:
            transport.close()
        for tracker in trackers.values():
            tracker.shutdown(time.time())
        store.close()

app = FastAPI(title="LapScope", lifespan=lifespan)
app.include_router(router, prefix="/api")


# extra Host names to answer to, comma-separated (a reverse proxy, a hostname
# the box is known by). Read once at import, like the app object itself.
ALLOWED_HOSTS = {h.strip().lower()
                 for h in os.environ.get("LS_ALLOWED_HOSTS", "").split(",")
                 if h.strip()}


def _hostname(host_header: str) -> str:
    """The name out of a Host header, port and IPv6 brackets removed."""
    h = host_header.strip()
    if h.startswith("["):                      # [::1]:8000
        return h[1:h.index("]")] if "]" in h else h[1:]
    return h.rsplit(":", 1)[0] if h.count(":") == 1 else h


def host_allowed(host_header: str) -> bool:
    """Is this Host header one LapScope should answer to?

    The threat is DNS rebinding: a page the user visits points its own domain
    at 127.0.0.1 (or their LAN address) and then talks to LapScope as if it
    were same-origin - reaching the whole API, `DELETE /api/sessions/{id}`
    included. That attack always leaves the attacker's *name* in the Host
    header; it cannot make a browser send a bare address it never resolved.

    So: localhost and any IP literal are fine - loopback, the exe, a phone
    hitting the Docker host by LAN IP - and any other name is refused unless
    the operator listed it in LS_ALLOWED_HOSTS (issue #67)."""
    name = _hostname(host_header).lower()
    if not name:
        return False
    # .local is mDNS - resolved on the LAN, not by a nameserver the attacker
    # can point anywhere - so a NAS or Pi reached at `box.local:8000` stays
    # reachable without opening the door rebinding needs
    if (name == "localhost" or name.endswith((".localhost", ".local"))
            or name in ALLOWED_HOSTS):
        return True
    try:
        ipaddress.ip_address(name)
    except ValueError:
        return False
    return True


@app.middleware("http")
async def revalidate_static(request, call_next):
    """Make browsers revalidate dashboard assets so UI updates apply on reload
    (cheap 304s on localhost; without this, heuristic caching serves stale JS/CSS)."""
    response = await call_next(request)
    if not request.url.path.startswith("/api"):
        response.headers.setdefault("Cache-Control", "no-cache")
    return response


# registered last, so it wraps everything above: a request for a host this
# server has no business answering is refused before any handler sees it
@app.middleware("http")
async def check_host(request, call_next):
    if not host_allowed(request.headers.get("host", "")):
        return Response("Invalid host header", status_code=400,
                        media_type="text/plain")
    return await call_next(request)


def origin_allowed(origin: str | None, host_header: str) -> bool:
    """WebSocket handshakes are exempt from CORS, so nothing stopped a page
    the user happened to visit from opening /ws/live and streaming their live
    position, speed and car while they drove (issue #67). The dashboard
    connects to its own origin, so requiring exactly that costs it nothing.
    A missing Origin is a non-browser client (a script, a CLI tool) and is
    allowed: the header is what browsers attach, and forging it isn't the
    threat - a program that can set headers can already reach the API."""
    if origin is None:
        return True
    netloc = urlsplit(origin).netloc.lower()
    return bool(netloc) and netloc == host_header.strip().lower()


@app.websocket("/ws/live")
async def ws_live(ws: WebSocket) -> None:
    if (not host_allowed(ws.headers.get("host", "")) or
            not origin_allowed(ws.headers.get("origin"), ws.headers.get("host", ""))):
        log.warning("Rejected /ws/live handshake from origin %s",
                    ws.headers.get("origin"))
        await ws.close(code=1008)  # policy violation
        return
    driver_id = ws.query_params.get("driver") if ws.query_params else None
    if driver_id is None:
        driver_id = ws.app.state.drivers[0].id
    hub: Hub | None = ws.app.state.hubs.get(driver_id)
    if hub is None:
        await ws.close(code=1008)
        return
    await ws.accept()
    q = hub.subscribe()
    # Watch the socket as well as the queue. Nothing is ever sent *to* this
    # endpoint, so this only completes on a disconnect - the tab closing, or
    # the server asking the connection to shut down. Waiting on q.get() alone
    # cannot see either: FH6 stops publishing the moment you pause, so a
    # handler with no frames to send would block until something arrived.
    # That made shutdown wait out its whole grace period on a client that had
    # already gone away, then log the cancellation as an ASGI error.
    watcher = asyncio.ensure_future(ws.receive())
    try:
        while True:
            getter = asyncio.ensure_future(q.get())
            done, _ = await asyncio.wait({getter, watcher},
                                         return_when=asyncio.FIRST_COMPLETED)
            if getter in done:
                await ws.send_json(getter.result())
            else:
                getter.cancel()
            if watcher in done:
                if watcher.result().get("type") == "websocket.disconnect":
                    break
                watcher = asyncio.ensure_future(ws.receive())  # ignore stray frames
    except WebSocketDisconnect:
        pass
    finally:
        watcher.cancel()
        hub.unsubscribe(q)


app.mount("/", StaticFiles(directory=Path(__file__).parent / "static", html=True), name="static")
