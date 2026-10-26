"""Public measured race report; the paid narrative is a management POST (ADR 33).

Shares the debrief's provider, ledger file and $1 UTC-month budget.
"""
from __future__ import annotations

import hashlib
import logging
import os

from fastapi import APIRouter, HTTPException, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from .. import heavy
from ..debrief import openrouter
from ..debrief.api import ledger
from ..debrief.contracts import MODEL
from ..debrief.ledger import CALL_LIMIT, BudgetError
from . import writer
from .facts import build

router = APIRouter()
log = logging.getLogger(__name__)


class Generate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lap_a: int = Field(gt=0)
    lap_b: int = Field(gt=0)
    retry: bool = False


def report_for(request, lap_a, lap_b):
    names = {d.id: d.name for d in getattr(request.app.state, "drivers", ())}
    return build(request.app.state.store, lap_a, lap_b, names)


def cache_key(report):
    return hashlib.sha256(
        f"race:{report['fingerprint']}:{MODEL}:{writer.PROMPT_VERSION}".encode()).hexdigest()


def view(report, db):
    cached = db.get(cache_key(report))
    result = cached.pop("result", None)
    if cached["state"] == "ready":
        cached["narrative"] = writer.validate(result, report)
    return {**report, "ai": {**cached, "enabled": bool(os.environ.get("OPENROUTER_API_KEY")),
                             "model": MODEL, "budget": db.budget()}}


@router.get("/race-report")
async def race_report(request: Request, response: Response, lap_a: int = Query(gt=0),
                      lap_b: int = Query(gt=0)):
    response.headers["Cache-Control"] = "no-store"
    return await heavy.run(request, ("race-report", lap_a, lap_b),
                           lambda: view(report_for(request, lap_a, lap_b), ledger(request)))


def write(store, db, names, lap_a, lap_b, key, retry=False):
    """One bounded, cached call for a pair: the button and the automatic writer
    (ADR 34) share it. Returns False when nothing was sent (cached, in flight,
    or a failure that needs an explicit retry). Raises ValueError when the
    request cannot fit the reservation and BudgetError when the month is spent."""
    report = build(store, lap_a, lap_b, names)
    encoded = writer.encode_request(report)  # prove the cap before reserving or sending
    fingerprint = cache_key(report)
    call_id = db.claim(fingerprint, retry)
    if call_id is None:
        return False
    cost, receipt_id, model, result, stage = None, None, None, None, "provider"
    try:
        provider = openrouter.request(encoded, key)
        cost = openrouter.receipt(provider)
        receipt_id, model = provider.get("id"), provider.get("model")
        if cost > CALL_LIMIT:
            raise ValueError("Provider exceeded the reserved cost")
        stage = "check"
        result = writer.decode(provider, report)
        if cache_key(build(store, lap_a, lap_b, names)) != fingerprint:
            result = None  # recordings changed while the provider was working
            log.info("Race report %d vs %d not shown: recordings changed during the call", lap_a, lap_b)
    except Exception as exc:
        # Never expose provider error bodies/keys, retry automatically or refund an uncertain charge.
        # The fact check's own messages ("states 3.9 s, ...") are safe to log and show what
        # to tune; anything from the provider or network is logged by type only.
        reason = str(exc) if stage == "check" and isinstance(exc, ValueError) else type(exc).__name__
        log.info("Race report %d vs %d not shown (%s): %s", lap_a, lap_b, stage, reason)
        result = None
    finally:
        db.finish(fingerprint, call_id, result=result, cost=cost,
                  receipt_id=receipt_id, model=model)
    return True


@router.post("/race-report/generate")
def generate(body: Generate, request: Request, response: Response):
    # The deployment gateway authenticates all management POSTs, as for the debrief.
    key = os.environ.get("OPENROUTER_API_KEY", "")
    if not key:
        raise HTTPException(503, "AI race reports are not configured; measurements remain available.")
    response.headers["Cache-Control"] = "no-store"
    db = ledger(request)
    names = {d.id: d.name for d in getattr(request.app.state, "drivers", ())}
    try:
        write(request.app.state.store, db, names, body.lap_a, body.lap_b, key, body.retry)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    except BudgetError as exc:
        raise HTTPException(429, str(exc)) from exc
    return view(report_for(request, body.lap_a, body.lap_b), db)
