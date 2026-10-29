"""Write last week's recap by itself once the week is over (ADR 35).

Web role only, and only with a provider key. Every half hour it looks at the
week that ended most recently; an hour after that week ends it sends it once,
through the same bounded, cached path as the button. A failed recap is never
retried here, and weeks before the last one are never backfilled: older weeks
are written by hand if wanted. SPLITTIME_AUTO_RECAPS=0 turns it off.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from datetime import timedelta

from ..debrief.api import ledger as _ledger_for
from ..debrief.ledger import BudgetError, Ledger
from . import facts
from .api import write

log = logging.getLogger(__name__)

INTERVAL_S = 1800
SETTLE_S = 3600  # a session finishing just before midnight has closed by then


def _table(conn):
    conn.execute("CREATE TABLE IF NOT EXISTS auto_recaps ("
                 "week TEXT PRIMARY KEY, created REAL NOT NULL, sent INTEGER NOT NULL)")


def handled(db: Ledger, week):
    with db.connection() as conn:
        _table(conn)
        return conn.execute("SELECT 1 FROM auto_recaps WHERE week=?", (week,)).fetchone() is not None


def run_once(store, drivers, db: Ledger, key, now=None):
    """One pass. Returns "ready", "failed" or None when nothing was sent."""
    now = time.time() if now is None else now
    monday = facts.monday_of(now) - timedelta(days=7)
    if now < facts.bounds(monday)[1] + SETTLE_S or handled(db, monday.isoformat()):
        return None
    try:
        called = write(store, drivers, db, monday, key, now=now)
    except ValueError as exc:
        log.info("Automatic weekly recap for %s skipped: %s", monday, exc)
        called = False
    except BudgetError as exc:
        log.info("Automatic weekly recap paused: %s", exc)
        return None
    with db.connection() as conn:
        _table(conn)
        conn.execute("INSERT OR IGNORE INTO auto_recaps VALUES (?,?,?)",
                     (monday.isoformat(), now, int(bool(called))))
    if called == "ready":
        log.info("Automatic weekly recap written for the week of %s", monday)
    elif called:
        log.info("Automatic weekly recap for the week of %s failed; not shown", monday)
    return called or None


async def loop(app):
    key = os.environ.get("OPENROUTER_API_KEY", "")
    if not key or os.environ.get("SPLITTIME_AUTO_RECAPS", "1") == "0":
        return
    store, drivers = app.state.store, app.state.drivers
    db = _ledger_for(type("Request", (), {"app": app})())
    while True:
        try:
            await asyncio.to_thread(run_once, store, drivers, db, key)
        except Exception:
            log.exception("automatic weekly recap pass failed")
        await asyncio.sleep(INTERVAL_S)
