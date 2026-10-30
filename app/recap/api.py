"""Public weekly recaps; the paid column is a management POST (ADR 35).

Shares the debrief's provider, ledger file and $1 UTC-month budget.
"""
from __future__ import annotations

import hashlib
import logging
import os
import time
from datetime import date

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict

from .. import heavy
from ..debrief import openrouter
from ..debrief.api import ledger
from ..debrief.contracts import MODEL
from ..debrief.ledger import CALL_LIMIT, BudgetError
from ..rivalry import rivalry_summary
from . import facts, writer

router = APIRouter()
log = logging.getLogger(__name__)


class Generate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    week: date
    retry: bool = False


def cache_key(report, fingerprint=None, version=None):
    return hashlib.sha256(
        f"recap:{fingerprint or report['fingerprint']}:{MODEL}:{version or writer.PROMPT_VERSION}"
        .encode()).hexdigest()


def adopt(report, db):
    """A column written before within reach (facts v1, prompt v1) moves to the
    week's new key: its numbers and names are all still facts, and it is not
    paid for again. It keeps its own wording, seconds and all."""
    db.rekey(cache_key(report, report["legacy_fingerprint"], 1), cache_key(report))


def view(report, db):
    adopt(report, db)
    report = {k: v for k, v in report.items() if k != "legacy_fingerprint"}
    cached = db.get(cache_key(report))
    result = cached.pop("result", None)
    if cached["state"] == "ready":
        cached["narrative"] = writer.validate(result, report)
    return {**report, "ai": {**cached, "enabled": bool(os.environ.get("OPENROUTER_API_KEY")),
                             "model": MODEL, "budget": db.budget()}}


def _summary(store, drivers):
    return rivalry_summary(store, drivers)


@router.get("/recap")
async def recaps(request: Request, response: Response):
    """Every week with a recorded lap, newest first, measured; with its column if written."""
    response.headers["Cache-Control"] = "no-store"
    store, drivers = request.app.state.store, getattr(request.app.state, "drivers", ())

    def work():
        summary, now, db = _summary(store, drivers), time.time(), ledger(request)
        return {"time_zone": str(facts.zone()),
                "weeks": [view(facts.build(summary, monday, now), db) for monday in facts.weeks(summary, now)]}
    return await heavy.run(request, ("recap",), work)


def write(store, drivers, db, monday, key, retry=False, now=None):
    """One bounded, cached call for a finished week: the button and the Monday
    writer share it. Returns False when nothing was sent (cached, in flight, or
    a failure that needs an explicit retry), otherwise "ready" or "failed".
    Raises ValueError when the week cannot have a recap and BudgetError when
    the month is spent."""
    now = time.time() if now is None else now
    if monday.weekday() != 0:
        raise ValueError("A recap week starts on a Monday.")
    report = facts.build(_summary(store, drivers), monday, now)
    if not report["complete"]:
        raise ValueError("A weekly recap is written once the week has ended.")
    if not report["facts"]["laps"]:
        raise ValueError("Nothing was recorded that week.")
    encoded = writer.encode_request(report)  # prove the cap before reserving or sending
    adopt(report, db)
    fingerprint = cache_key(report)
    call_id = db.claim(fingerprint, retry)
    if call_id is None:
        return False
    cost, receipt_id, model, result, stage, answer = None, None, None, None, "provider", None
    try:
        provider = openrouter.request(encoded, key)
        cost = openrouter.receipt(provider)
        receipt_id, model = provider.get("id"), provider.get("model")
        if cost > CALL_LIMIT:
            raise ValueError("Provider exceeded the reserved cost")
        stage = "check"
        answer = openrouter.content(provider)
        result = writer.validate(answer, report)
        if cache_key(facts.build(_summary(store, drivers), monday, now)) != fingerprint:
            result = None  # recordings changed while the provider was working
            log.info("Weekly recap %s not shown: recordings changed during the call", monday)
    except Exception as exc:
        # as for race reports: the check's own messages are safe to log, the provider's are not
        reason = str(exc) if stage == "check" and isinstance(exc, ValueError) else type(exc).__name__
        log.info("Weekly recap %s not shown (%s): %s", monday, stage, reason)
        if answer is not None:
            db.reject(fingerprint, call_id, reason, answer)
        result = None
    finally:
        db.finish(fingerprint, call_id, result=result, cost=cost, receipt_id=receipt_id, model=model)
    return "ready" if result is not None else "failed"


@router.post("/recap/generate")
def generate(body: Generate, request: Request, response: Response):
    # The deployment gateway authenticates all management POSTs, as for race reports.
    key = os.environ.get("OPENROUTER_API_KEY", "")
    if not key:
        raise HTTPException(503, "AI recaps are not configured; the measured week remains available.")
    response.headers["Cache-Control"] = "no-store"
    store, drivers, db = request.app.state.store, getattr(request.app.state, "drivers", ()), ledger(request)
    try:
        write(store, drivers, db, body.week, key, body.retry)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    except BudgetError as exc:
        raise HTTPException(429, str(exc)) from exc
    return view(facts.build(_summary(store, drivers), body.week, time.time()), db)
