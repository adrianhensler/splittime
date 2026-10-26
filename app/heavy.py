"""A shared limit on the expensive measured reads: race report and debrief.

Both are public GETs that take seconds and tens of MB each, and a browser
that gives up on one does not stop the server (behind this app's HTTP
middleware a disconnect is not even visible to the endpoint). On 2026-10-26
about 60 abandoned race report requests for two pairs took the web process to
5.5 GB and swapped the host. So, without relying on disconnects:

- identical requests in flight share one build (those 60 would have been 2);
- at most MAX_BUILDS builds run at once, in a worker thread so pages stay
  responsive, which bounds memory however many arrive;
- at most MAX_PENDING different builds may wait or run; past that the caller
  is told the server is busy (503, Retry-After) rather than queued.
"""
from __future__ import annotations

import asyncio
from types import SimpleNamespace

from fastapi import HTTPException

MAX_BUILDS = 2
MAX_PENDING = 6
BUSY = "SplitTime is busy measuring other reports. Try again in a moment."


def _state(app):
    # one per app, made in its own event loop
    if getattr(app.state, "heavy", None) is None:
        app.state.heavy = SimpleNamespace(slots=asyncio.Semaphore(MAX_BUILDS), inflight={})
    return app.state.heavy


async def _build(slots, work):
    async with slots:
        return await asyncio.to_thread(work)


def _finished(heavy, key, task):
    heavy.inflight.pop(key, None)
    if not task.cancelled():
        task.exception()  # read here, so a build every caller left is not reported unhandled


async def run(request, key, work):
    """`work()` in a thread, shared with any identical request (`key`) in flight."""
    heavy = _state(request.app)
    task = heavy.inflight.get(key)
    if task is None:
        if len(heavy.inflight) >= MAX_PENDING:
            raise HTTPException(503, BUSY, headers={"Retry-After": "2"})
        task = asyncio.ensure_future(_build(heavy.slots, work))
        heavy.inflight[key] = task
        task.add_done_callback(lambda done: _finished(heavy, key, done))
    # one caller giving up must not cancel the build the others are waiting for
    return await asyncio.shield(task)
