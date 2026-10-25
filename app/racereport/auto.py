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


def takeovers(summary, since):
    """(new record lap, record it beat, finish time), newest first, for every
    change of record holder finishing at or after `since`. Laps finishing at
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
            record = min(best.values(), key=lambda lap: lap["time_s"], default=None)
            batch = {}
            for t, lap in stamped[i:j]:
                own = best.get(lap["driver_id"])
                if (own is None or lap["time_s"] < own["time_s"]) and (
                        lap["driver_id"] not in batch or lap["time_s"] < batch[lap["driver_id"]][1]["time_s"]):
                    batch[lap["driver_id"]] = (t, lap)
            for t, lap in batch.values():
                if (record is not None and record["driver_id"] != lap["driver_id"]
                        and lap["time_s"] < record["time_s"] and t >= since):
                    found.append((lap["lap_id"], record["lap_id"], t))
            for _, lap in batch.values():
                best[lap["driver_id"]] = lap
            i = j
    return sorted(found, key=lambda item: -item[2])


def auto_calls(db: Ledger):
    with db.connection() as conn:
        conn.execute("CREATE TABLE IF NOT EXISTS auto_reports ("
                     "lap_a INTEGER NOT NULL, lap_b INTEGER NOT NULL, month TEXT NOT NULL, "
                     "created REAL NOT NULL, PRIMARY KEY (lap_a, lap_b))")
        return conn.execute("SELECT count(*) FROM auto_reports WHERE month=?",
                            (db.month(),)).fetchone()[0]


def run_once(store, drivers, db: Ledger, key, done: set, now=None):
    """One pass. `done` holds pairs never to look at again in this process."""
    now = time.time() if now is None else now
    names = {d.id: d.name for d in drivers}
    sent = 0
    for lap_a, lap_b, _ in takeovers(rivalry_summary(store, drivers), now - WINDOW_S):
        if (lap_a, lap_b) in done:
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
            done.add((lap_a, lap_b))
            continue
        except ValueError as exc:
            log.info("Automatic race report %d vs %d skipped: %s", lap_a, lap_b, exc)
            done.add((lap_a, lap_b))
            continue
        except BudgetError as exc:
            log.info("Automatic race reports paused: %s", exc)
            break
        done.add((lap_a, lap_b))
        if called:
            sent += 1
            with db.connection() as conn:
                conn.execute("INSERT OR IGNORE INTO auto_reports VALUES (?,?,?,?)",
                             (lap_a, lap_b, db.month(), now))
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
