"""Web-owned cache and durable integer-dollar reservations, separate from telemetry."""
from __future__ import annotations

import json
import sqlite3
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

MONTH_LIMIT = 1_000_000  # micro USD: $1 per UTC calendar month
CALL_LIMIT = 10_000     # reserve at most $0.01 before every network call
LEASE_S = 120
REJECTED_KEPT = 50  # newest answers that failed a fact check, for tuning it


class BudgetError(Exception):
    pass


class Ledger:
    def __init__(self, path, now=time.time):
        self.path, self.now = str(path), now
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS calls (
                    id TEXT PRIMARY KEY, report_key TEXT NOT NULL, month TEXT NOT NULL,
                    amount INTEGER NOT NULL, created REAL NOT NULL, status TEXT NOT NULL,
                    receipt_id TEXT, model TEXT);
                CREATE TABLE IF NOT EXISTS reports (
                    key TEXT PRIMARY KEY, call_id TEXT NOT NULL, state TEXT NOT NULL,
                    result TEXT, created REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS rejected (
                    call_id TEXT PRIMARY KEY, report_key TEXT NOT NULL, created REAL NOT NULL,
                    reason TEXT NOT NULL, answer TEXT NOT NULL);
            """)

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.path, timeout=5)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def month(self):
        return datetime.fromtimestamp(self.now(), timezone.utc).strftime("%Y-%m")

    def budget(self):
        with self.connection() as db:
            spent = db.execute("SELECT coalesce(sum(amount),0) FROM calls WHERE month=?",
                               (self.month(),)).fetchone()[0]
        return {"month": self.month(), "limit_usd": MONTH_LIMIT / 1e6,
                "used_or_reserved_usd": spent / 1e6,
                "remaining_usd": max(0, MONTH_LIMIT - spent) / 1e6}

    def get(self, key):
        with self.connection() as db:
            row = db.execute("SELECT r.*, c.amount, c.receipt_id, c.model FROM reports r "
                             "JOIN calls c ON c.id=r.call_id WHERE r.key=?", (key,)).fetchone()
        if row is None:
            return {"state": "missing"}
        state = row["state"]
        if state == "pending" and self.now() - row["created"] > LEASE_S:
            state = "uncertain"
        return {"state": state, "result": json.loads(row["result"]) if row["result"] else None,
                "cost_or_reserved_usd": row["amount"] / 1e6, "model": row["model"],
                "receipt_id": row["receipt_id"]}

    def claim(self, key, retry=False):
        """One in-flight call per report, across workers/restarts. No implicit retry."""
        now, month, call_id = self.now(), self.month(), uuid.uuid4().hex
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM reports WHERE key=?", (key,)).fetchone()
            if row:
                active = row["state"] == "pending" and now - row["created"] <= LEASE_S
                if row["state"] == "ready" or active or not retry:
                    return None
            spent = db.execute("SELECT coalesce(sum(amount),0) FROM calls WHERE month=?",
                               (month,)).fetchone()[0]
            breached = db.execute("SELECT 1 FROM calls WHERE month=? AND amount>? LIMIT 1",
                                  (month, CALL_LIMIT)).fetchone()
            if breached:
                raise BudgetError("A provider charge exceeded the per-call cap. AI is stopped for this UTC month.")
            if spent + CALL_LIMIT > MONTH_LIMIT:
                raise BudgetError("The $1 UTC-month debrief budget has been reached.")
            db.execute("INSERT INTO calls VALUES (?,?,?,?,?,'reserved',NULL,NULL)",
                       (call_id, key, month, CALL_LIMIT, now))
            db.execute("INSERT OR REPLACE INTO reports VALUES (?,?,'pending',NULL,?)",
                       (key, call_id, now))
        return call_id

    def finish(self, key, call_id, *, result=None, cost=None, receipt_id=None, model=None):
        """Unknown charges keep the full reservation; a known charge always gets recorded."""
        state = "ready" if result is not None else "failed"
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            if cost is not None:
                db.execute("UPDATE calls SET amount=?,status='charged',receipt_id=?,model=? WHERE id=?",
                           (cost, receipt_id, model, call_id))
            else:
                db.execute("UPDATE calls SET status='uncertain' WHERE id=?", (call_id,))
            # by call ID alone: each claim has its own, and it survives a rekey
            # while the call is in flight, so a paid answer is never dropped
            db.execute("UPDATE reports SET state=?,result=? WHERE call_id=?",
                       (state, json.dumps(result) if result is not None else None, call_id))

    def rekey(self, old, new):
        """Move a cached report to a new key when its facts were renamed, never
        over one already there: no call is made and no charge is repeated."""
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute("SELECT 1 FROM reports WHERE key=?", (new,)).fetchone():
                return False
            moved = db.execute("UPDATE reports SET key=? WHERE key=?", (new, old)).rowcount
            db.execute("UPDATE calls SET report_key=? WHERE report_key=?", (new, old))
        return bool(moved)

    def reject(self, key, call_id, reason, answer):
        """Keep a model answer that failed a check, with the reason; never shown."""
        with self.connection() as db:
            db.execute("INSERT OR REPLACE INTO rejected VALUES (?,?,?,?,?)",
                       (call_id, key, self.now(), reason, json.dumps(answer)))
            db.execute("DELETE FROM rejected WHERE call_id NOT IN (SELECT call_id FROM rejected "
                       "ORDER BY created DESC LIMIT ?)", (REJECTED_KEPT,))

    def rejected(self):
        with self.connection() as db:
            rows = db.execute("SELECT * FROM rejected ORDER BY created DESC").fetchall()
        return [{**dict(row), "answer": json.loads(row["answer"])} for row in rows]
