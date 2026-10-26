"""The shared limit on race report and debrief builds (app/heavy.py)."""
import asyncio
import threading
import time
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app import heavy


def caller():
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace()))


class Builds:
    """Counts builds and the most that ran at once."""
    def __init__(self):
        self.lock, self.running, self.peak, self.count = threading.Lock(), 0, 0, 0

    def work(self, value, seconds=0.05):
        def build():
            with self.lock:
                self.running += 1
                self.count += 1
                self.peak = max(self.peak, self.running)
            time.sleep(seconds)
            with self.lock:
                self.running -= 1
            return value
        return build


def test_different_pairs_build_at_most_max_builds_at_once():
    request, builds = caller(), Builds()

    async def main():
        return await asyncio.gather(*(heavy.run(request, ("race", n), builds.work(n)) for n in range(6)))
    assert asyncio.run(main()) == list(range(6))
    assert builds.peak == heavy.MAX_BUILDS and builds.count == 6


def test_a_flood_of_the_same_pair_is_one_build():
    # the 2026-10-26 incident: dozens of requests for the same two pairs
    request, builds = caller(), Builds()

    async def main():
        same = [heavy.run(request, ("race", 174, 98), builds.work("174v98")) for _ in range(30)]
        other = [heavy.run(request, ("race", 174, 22), builds.work("174v22")) for _ in range(30)]
        return await asyncio.gather(*same, *other)
    results = asyncio.run(main())
    assert results == ["174v98"] * 30 + ["174v22"] * 30
    assert builds.count == 2
    assert request.app.state.heavy.inflight == {}  # nothing left behind


def test_past_max_pending_the_caller_is_told_to_retry():
    request, builds = caller(), Builds()

    async def main():
        waiting = [asyncio.ensure_future(heavy.run(request, ("race", n), builds.work(n, 0.2)))
                   for n in range(heavy.MAX_PENDING)]
        await asyncio.sleep(0.01)
        with pytest.raises(HTTPException) as busy:
            await heavy.run(request, ("race", 99), builds.work(99))
        assert busy.value.status_code == 503 and busy.value.headers == {"Retry-After": "2"}
        # an identical request still joins the build in flight
        joined = await heavy.run(request, ("race", 0), builds.work("unused"))
        return joined, await asyncio.gather(*waiting)
    joined, done = asyncio.run(main())
    assert joined == 0 and done == list(range(heavy.MAX_PENDING))
    assert builds.count == heavy.MAX_PENDING


def test_an_error_inside_the_build_reaches_every_caller():
    request = caller()

    def build():
        time.sleep(0.02)
        raise LookupError("Selected lap no longer exists")

    async def main():
        return await asyncio.gather(*(heavy.run(request, ("race", 1), build) for _ in range(3)),
                                    return_exceptions=True)
    errors = asyncio.run(main())
    assert [str(e) for e in errors] == ["Selected lap no longer exists"] * 3
