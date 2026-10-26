"""The shared limit on race report and debrief builds (app/heavy.py)."""
import asyncio
import threading
import time
from types import SimpleNamespace

from app import heavy


class Caller:
    def __init__(self, app, gone=False):
        self.app, self.gone = app, gone

    async def is_disconnected(self):
        return self.gone


def test_at_most_max_builds_run_at_once_and_a_departed_caller_costs_nothing():
    app = SimpleNamespace(state=SimpleNamespace())
    lock, running, peak, done = threading.Lock(), [0], [0], []

    def work(n):
        def build():
            with lock:
                running[0] += 1
                peak[0] = max(peak[0], running[0])
            time.sleep(0.05)
            with lock:
                running[0] -= 1
            done.append(n)
            return n
        return build

    async def main():
        results = await asyncio.gather(*(heavy.run(Caller(app), work(n)) for n in range(6)),
                                       heavy.run(Caller(app, gone=True), work(99)))
        return results
    results = asyncio.run(main())
    assert results[:6] == list(range(6))
    assert peak[0] == heavy.MAX_BUILDS
    assert results[6].status_code == heavy.GONE and 99 not in done


def test_an_error_inside_the_build_still_reaches_the_caller():
    app = SimpleNamespace(state=SimpleNamespace())

    def build():
        raise LookupError("Selected lap no longer exists")

    async def main():
        try:
            await heavy.run(Caller(app), build)
        except LookupError as exc:
            return str(exc)
    assert asyncio.run(main()) == "Selected lap no longer exists"
