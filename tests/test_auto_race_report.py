"""Automatic race reports on a change of record holder (ADR 34)."""
from datetime import datetime, timezone

from fastapi import HTTPException

from app.debrief.ledger import BudgetError, Ledger
from app.racereport import auto


def lap(lap_id, driver, time_s, at, clean=True):
    stamp = None if at is None else datetime.fromtimestamp(at, timezone.utc).isoformat().replace("+00:00", "Z")
    return {"lap_id": lap_id, "driver_id": driver, "time_s": time_s,
            "finished_at_utc": stamp, "candidate_clean": clean}


def summary(*groups):
    return {"categories": [{"attempts": list(attempts)} for attempts in groups]}


def test_takeovers_are_changes_of_record_holder_newest_first():
    route = [lap(1, "a", 60, 10), lap(2, "b", 59, 20),      # b answers and beats the only time
             lap(3, "a", 58, 30), lap(4, "a", 57, 40),      # a takes it back, then extends
             lap(5, "b", 56.5, 50, clean=False)]            # a lap that does not count
    other = [lap(6, "b", 70, 15), lap(7, "a", 71, 25)]      # slower answer: no takeover
    assert auto.takeovers(summary(route, other), 0) == [(3, 2, 30), (2, 1, 20)]
    assert auto.takeovers(summary(route), 25) == [(3, 2, 30)]  # the window
    # simultaneous finishes are one batch: neither took anything from the other
    assert auto.takeovers(summary([lap(1, "a", 60, 10), lap(2, "b", 59, 10)]), 0) == []
    # an undated clean lap makes the order unknown, so nothing is claimed
    assert auto.takeovers(summary([lap(1, "a", 60, None), lap(2, "b", 59, 20)]), 0) == []


class Driver:
    def __init__(self, ident, name):
        self.id, self.name = ident, name


def test_a_pass_sends_each_takeover_once_within_the_monthly_cap(tmp_path, monkeypatch):
    db = Ledger(tmp_path / "debrief.db", now=lambda: 1_800_000_000)
    pairs = [(10 + n, 100 + n, 1_800_000_000 - n) for n in range(5)]
    monkeypatch.setattr(auto, "rivalry_summary", lambda store, drivers: None)
    monkeypatch.setattr(auto, "takeovers", lambda summary, since: pairs)
    calls, outcome = [], {}

    def write(store, ledger, names, lap_a, lap_b, key, retry=False):
        calls.append((lap_a, lap_b, retry, names))
        result = outcome.get(lap_a, True)
        if isinstance(result, Exception):
            raise result
        return result
    monkeypatch.setattr(auto, "write", write)
    outcome[11] = HTTPException(409, "A selected session is still recording.")
    outcome[12] = HTTPException(409, "Race reports compare eligible bests only.")
    outcome[13] = False                                     # already cached: nothing sent
    done = set()
    drivers = [Driver("a", "FishFighterNS")]
    assert auto.run_once(None, drivers, db, "key", done, now=1_800_000_000) == 2
    assert all(retry is False for _, _, retry, _ in calls)   # never an automatic retry
    assert calls[0][3] == {"a": "FishFighterNS"}
    assert done == {(10, 100), (12, 102), (13, 103), (14, 104)}  # 11 waits for its session
    assert auto.auto_calls(db) == 2

    calls.clear()
    outcome.pop(11)
    assert auto.run_once(None, drivers, db, "key", done, now=1_800_000_000) == 1
    assert [c[0] for c in calls] == [11]

    # the automatic share of the month stops at AUTO_MONTH_CALLS; a spent budget pauses
    monkeypatch.setattr(auto, "AUTO_MONTH_CALLS", 3)
    calls.clear()
    assert auto.run_once(None, drivers, db, "key", set(), now=1_800_000_000) == 0
    assert calls == []
    monkeypatch.setattr(auto, "AUTO_MONTH_CALLS", 20)
    outcome[10] = BudgetError("spent")
    assert auto.run_once(None, drivers, db, "key", set(), now=1_800_000_000) == 0
    assert [c[0] for c in calls] == [10]
