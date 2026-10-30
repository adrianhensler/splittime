"""Has anything the pages show changed? One short token (ADR 36).

Open pages ask about once a minute while visible and offer a refresh when the
token differs from the one they loaded with. It covers what Rivalry, Stats,
Recap, Replay and Analysis read: finished sessions and laps, attempts, manual
edits, names, groups, and finished AI writing. Frames, and a session or lap
still being recorded, are left out, so a recording does not change it every
second; a lap counts once it has finished.
"""
from __future__ import annotations

import hashlib
import sqlite3
from pathlib import Path

from fastapi import APIRouter, Request, Response

router = APIRouter()

QUERIES = (
    "SELECT id, ended_at, name, route_id, group_id, conditions, track_type"
    " FROM sessions WHERE ended_at IS NOT NULL ORDER BY id",
    "SELECT id, session_id, lap_time, ended_t, flags FROM laps"
    " WHERE ended_t IS NOT NULL ORDER BY id",
    "SELECT session_id, ended_at FROM attempts ORDER BY session_id",
    "SELECT id, session_id, kind, anchor_t, value FROM edits ORDER BY id",
    "SELECT id, name, kind, kind_user FROM routes ORDER BY id",
    "SELECT id, name FROM session_groups ORDER BY id",
    "SELECT ordinal, name FROM car_names ORDER BY ordinal",
)
# finished AI writing (race reports, debriefs, recaps); a report moved to a
# new key keeps its `created`, so moving one is not a change
REPORTS = "SELECT count(*), max(created) FROM reports WHERE state = 'ready'"


def token(store) -> str:
    digest = hashlib.sha256()
    with store.reader() as conn:
        for query in QUERIES:
            for row in conn.execute(query):
                digest.update(repr(tuple(row)).encode())
            digest.update(b"|")
    written, path = (0, None), Path(store.db_path).parent / "debrief.db"
    if path.exists():
        # read-only: a poll must never create or write the ledger
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=5)
        try:
            written = tuple(conn.execute(REPORTS).fetchone())
        except sqlite3.OperationalError:
            pass  # no reports table yet: nothing written
        finally:
            conn.close()
    digest.update(repr(written).encode())
    return digest.hexdigest()[:16]


@router.get("/changes")
def changes(request: Request, response: Response):
    """A token that changes when results do; compare it, never parse it."""
    response.headers["Cache-Control"] = "no-store"
    return {"token": token(request.app.state.store)}
