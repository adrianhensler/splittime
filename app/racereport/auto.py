"""Write a race report by itself when a route record changes hands (ADR 34).

Web role only, and only with a provider key. Every few minutes it reads the
recorded takeovers of the last fortnight and sends each one, once, through the
same bounded and cached path as the management button: the new record as A
against the record it beat as B. A failed narrative is never retried here, a
session still recording waits for the next pass, and automatic calls stop at
AUTO_MONTH_CALLS per UTC month so the shared $1 budget stays mostly manual.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from datetime import datetime

from fastapi import HTTPException

from ..debrief.api import ledger as _ledger_for
from ..debrief.ledger import BudgetError, Ledger
from ..rivalry import rivalry_summary
from .api import write

log = logging.getLogger(__name__)

INTERVAL_S = 300
WINDOW_S = 14 * 86400
AUTO_MONTH_CALLS = 20  # at most $0.20 of the $1 month, at the $0.01 reservation


def _stamp(value):
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except (AttributeError, ValueError):
        return None


def _run(lap):
    return f"{lap['session_id']}@{lap['started_at_utc']}"


def takeovers(summary, since):
    """(new record lap, record it beat, finish time, identity), newest first,
    for every change of record holder finishing at or after `since`. The
    identity names both runs by session and start time, since lap IDs can be
    reused after the newest laps are deleted. Laps finishing at
    the same instant are one batch read against the bests before it, and an
    undated clean lap makes a group's order unknown, so it is skipped."""
    found = []
    for group in summary["categories"]:
        clean = [lap for lap in group["attempts"] if lap.get("candidate_clean")]
        stamped = [(_stamp(lap.get("finished_at_utc")), lap) for lap in clean]
        if any(t is None for t, _ in stamped):
            continue
        stamped.sort(key=lambda item: item[0])
        best = {}
        i = 0
        while i < len(stamped):
            j = i
            while j < len(stamped) and stamped[j][0] == stamped[i][0]:
                j += 1
            before = min(best.values(), key=lambda lap: lap["time_s"], default=None)
            batch = {}
            for t, lap in stamped[i:j]:
                own = best.get(lap["driver_id"])
                if (own is None or lap["time_s"] < own["time_s"]) and (
                        lap["driver_id"] not in batch or lap["time_s"] < batch[lap["driver_id"]][1]["time_s"]):
                    batch[lap["driver_id"]] = (t, lap)
            for _, lap in batch.values():
                best[lap["driver_id"]] = lap
            # Only the holder after the whole batch took anything: two drivers
            # improving at once while the old holder stays fastest is no takeover.
            standing = sorted(best.values(), key=lambda lap: lap["time_s"])
            after = standing[0]
            outright = len(standing) < 2 or after["time_s"] < standing[1]["time_s"]  # a tie takes nothing
            if (before is not None and outright and after["driver_id"] != before["driver_id"]
                    and after["time_s"] < before["time_s"] and stamped[i][0] >= since):
                found.append((after["lap_id"], before["lap_id"], stamped[i][0],
                              f"{_run(after)}|{_run(before)}"))
            i = j
    return sorted(found, key=lambda item: -item[2])


def _table(conn):
    # every takeover handled, sent or found already cached: durable, so a restart
    # or a later cache change never sends the same takeover again
    conn.execute("CREATE TABLE IF NOT EXISTS auto_reports ("
                 "pair TEXT PRIMARY KEY, lap_a INTEGER NOT NULL, lap_b INTEGER NOT NULL, "
                 "month TEXT NOT NULL, created REAL NOT NULL, sent INTEGER NOT NULL)")


def auto_calls(db: Ledger):
    with db.connection() as conn:
        _table(conn)
        return conn.execute("SELECT count(*) FROM auto_reports WHERE month=? AND sent=1",
                            (db.month(),)).fetchone()[0]


def handled(db: Ledger, pair):
    with db.connection() as conn:
        _table(conn)
        return conn.execute("SELECT 1 FROM auto_reports WHERE pair=?",
                            (pair,)).fetchone() is not None


def run_once(store, drivers, db: Ledger, key, done: set, now=None):
    """One pass. `done` holds pairs never to look at again in this process."""
    now = time.time() if now is None else now
    names = {d.id: d.name for d in drivers}
    sent = 0
    for lap_a, lap_b, _, pair in takeovers(rivalry_summary(store, drivers), now - WINDOW_S):
        if pair in done or handled(db, pair):
            done.add(pair)
            continue
        if auto_calls(db) >= AUTO_MONTH_CALLS:
            log.info("Automatic race reports: monthly limit of %d reached", AUTO_MONTH_CALLS)
            break
        try:
            called = write(store, db, names, lap_a, lap_b, key)
        except HTTPException as exc:
            if "still recording" in str(exc.detail):
                continue  # try again once the session closes
            log.info("Automatic race report %d vs %d skipped: %s", lap_a, lap_b, exc.detail)
            done.add(pair)
            continue
        except ValueError as exc:
            log.info("Automatic race report %d vs %d skipped: %s", lap_a, lap_b, exc)
            done.add(pair)
            continue
        except BudgetError as exc:
            log.info("Automatic race reports paused: %s", exc)
            break
        done.add(pair)
        with db.connection() as conn:
            conn.execute("INSERT OR IGNORE INTO auto_reports VALUES (?,?,?,?,?,?)",
                         (pair, lap_a, lap_b, db.month(), now, int(called)))
        if called:
            sent += 1
            log.info("Automatic race report written for takeover %d vs %d", lap_a, lap_b)
    return sent


async def loop(app):
    key = os.environ.get("OPENROUTER_API_KEY", "")
    if not key or os.environ.get("SPLITTIME_AUTO_RACE_REPORTS", "1") == "0":
        return
    done: set = set()
    store, drivers = app.state.store, app.state.drivers
    db = _ledger_for(type("Request", (), {"app": app})())
    while True:
        try:
            await asyncio.to_thread(run_once, store, drivers, db, key, done)
        except Exception:
            log.exception("automatic race report pass failed")
        await asyncio.sleep(INTERVAL_S)
