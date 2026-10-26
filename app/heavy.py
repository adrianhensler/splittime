"""A shared limit on the expensive measured reads: race report and debrief.

Both are public GETs that take seconds and tens of MB each. A browser that
gives up on one does not stop the server, so requests fired in quick
succession used to pile up: on 2026-10-26 about 60 cancelled race reports took
the web process to 5.5 GB and swapped the host. Now at most MAX_BUILDS run at
once, in a worker thread so pages stay responsive, and a request whose caller
has already gone is dropped before it starts.
"""
from __future__ import annotations

import asyncio

from fastapi import Request, Response

MAX_BUILDS = 2
GONE = 499  # the caller closed the connection; nobody reads this response


def _slots(app):
    # one per app, made in its own event loop
    if getattr(app.state, "heavy_slots", None) is None:
        app.state.heavy_slots = asyncio.Semaphore(MAX_BUILDS)
    return app.state.heavy_slots


async def run(request: Request, work):
    """Run `work()` in a thread once a slot is free, unless the caller left."""
    async with _slots(request.app):
        if await request.is_disconnected():
            return Response(status_code=GONE)
        return await asyncio.to_thread(work)
