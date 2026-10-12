"""Two viewers' sockets open at the same time, one per driver: each receives
only its own driver's frames, and one going away leaves the other subscribed.

The Live page opens `ws/live?driver=<id>` once per configured driver. This
drives the real `ws_live` handler with stand-in sockets; no network, no
recorder, no storage."""
from __future__ import annotations

import asyncio
from types import SimpleNamespace

from app.main import ws_live
from app.telemetry.hub import Hub


class Socket:
    """Enough of a Starlette WebSocket for ws_live, with a query string."""

    def __init__(self, state, driver=None):
        self.headers = {"origin": "http://localhost:8100", "host": "localhost:8100"}
        self.query_params = {} if driver is None else {"driver": driver}
        self.app = SimpleNamespace(state=state)
        self.accepted, self.close_code = False, None
        self.incoming: list[dict] = []
        self.sent: list[dict] = []

    async def accept(self):
        self.accepted = True

    async def close(self, code=1000):
        self.close_code = code

    async def send_json(self, msg):
        self.sent.append(msg)

    async def receive(self):
        while not self.incoming:
            await asyncio.sleep(0.001)
        return self.incoming.pop(0)


def app_state():
    drivers = [SimpleNamespace(id="alpha"), SimpleNamespace(id="beta")]
    hubs = {d.id: Hub() for d in drivers}
    return SimpleNamespace(drivers=drivers, hubs=hubs, hub=hubs["alpha"]), hubs


async def settle():
    """Give the handlers time to drain their queues (they poll every 1 ms)."""
    for _ in range(60):
        await asyncio.sleep(0.001)


def test_two_simultaneous_sockets_each_get_only_their_driver():
    async def scenario():
        state, hubs = app_state()
        alpha, beta, legacy = Socket(state, "alpha"), Socket(state, "beta"), Socket(state)
        tasks = [asyncio.ensure_future(ws_live(ws)) for ws in (alpha, beta, legacy)]
        await settle()
        assert alpha.accepted and beta.accepted and legacy.accepted
        assert len(hubs["alpha"]._subscribers) == 2    # alpha's viewer + the no-query client
        assert len(hubs["beta"]._subscribers) == 1

        # both drivers "driving" at once, interleaved
        for i in range(5):
            hubs["alpha"].publish({"who": "alpha", "n": i})
            hubs["beta"].publish({"who": "beta", "n": i})
        await settle()
        assert [m["who"] for m in alpha.sent] == ["alpha"] * 5
        assert [m["who"] for m in beta.sent] == ["beta"] * 5
        assert [m["n"] for m in beta.sent] == list(range(5))
        assert [m["who"] for m in legacy.sent] == ["alpha"] * 5   # first driver, as before

        # beta's viewer leaves; alpha's keeps receiving, beta's hub is released
        beta.incoming.append({"type": "websocket.disconnect", "code": 1001})
        await settle()
        assert tasks[1].done()
        assert not hubs["beta"]._subscribers
        hubs["beta"].publish({"who": "beta", "n": 99})    # nobody listening: must not raise
        hubs["alpha"].publish({"who": "alpha", "n": 5})
        await settle()
        assert alpha.sent[-1] == {"who": "alpha", "n": 5}
        assert len(beta.sent) == 5

        # a viewer comes back for beta while alpha is still streaming
        again = Socket(state, "beta")
        tasks.append(asyncio.ensure_future(ws_live(again)))
        await settle()
        hubs["beta"].publish({"who": "beta", "n": 100})
        await settle()
        assert again.sent == [{"who": "beta", "n": 100}]
        assert len(alpha.sent) == 6

        for ws in (alpha, legacy, again):
            ws.incoming.append({"type": "websocket.disconnect", "code": 1001})
        await asyncio.wait_for(asyncio.gather(*tasks), 2)
        assert not hubs["alpha"]._subscribers and not hubs["beta"]._subscribers

    asyncio.run(scenario())


def test_an_unknown_driver_is_refused_without_touching_the_others():
    async def scenario():
        state, hubs = app_state()
        stranger = Socket(state, "nobody")
        await ws_live(stranger)
        assert stranger.close_code == 1008 and not stranger.accepted
        assert not hubs["alpha"]._subscribers and not hubs["beta"]._subscribers

    asyncio.run(scenario())
