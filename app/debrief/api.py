"""Public measured/cached reads; paid generation is a management POST."""
from __future__ import annotations

import hashlib
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from .. import heavy
from . import openrouter
from .contracts import MODEL, PROMPT_VERSION, explain
from .ledger import CALL_LIMIT, BudgetError, Ledger
from .summary import build_report

router = APIRouter()


class Generate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lap_a: int = Field(gt=0)
    lap_b: int | None = Field(default=None, gt=0)
    retry: bool = False


def ledger(request):
    return Ledger(Path(request.app.state.store.db_path).parent / "debrief.db")


def cache_key(report):
    return hashlib.sha256(f"{report['fingerprint']}:{MODEL}:{PROMPT_VERSION}".encode()).hexdigest()


def view(report, db):
    cached = db.get(cache_key(report))
    result = cached.pop("result", None)
    if cached["state"] == "ready":
        cached["explanation"] = explain(result, report)
    return {**report, "ai": {**cached, "enabled": bool(os.environ.get("OPENROUTER_API_KEY")),
                             "model": MODEL, "budget": db.budget()}}


@router.get("/debrief")
async def debrief(request: Request, response: Response, lap_a: int = Query(gt=0),
                  lap_b: int | None = Query(default=None, gt=0)):
    response.headers["Cache-Control"] = "no-store"
    return await heavy.run(request, ("debrief", lap_a, lap_b),
                           lambda: view(build_report(request.app.state.store, lap_a, lap_b), ledger(request)))


@router.post("/debrief/generate")
def generate(body: Generate, request: Request, response: Response):
    # The deployment gateway authenticates all management POSTs (same policy as edits).
    # Never publish this app directly; no in-app login is invented here.
    key = os.environ.get("OPENROUTER_API_KEY", "")
    if not key:
        raise HTTPException(503, "AI debrief is not configured; measured results remain available.")
    response.headers["Cache-Control"] = "no-store"
    store, db = request.app.state.store, ledger(request)
    report = build_report(store, body.lap_a, body.lap_b)
    encoded = openrouter.encode_request(report)  # prove the cap before reserving or sending
    fingerprint = cache_key(report)
    try:
        call_id = db.claim(fingerprint, body.retry)
    except BudgetError as exc:
        raise HTTPException(429, str(exc)) from exc
    if call_id is None:
        return view(report, db)
    cost, receipt_id, model, result = None, None, None, None
    try:
        provider = openrouter.request(encoded, key)
        cost = openrouter.receipt(provider)
        receipt_id, model = provider.get("id"), provider.get("model")
        if cost > CALL_LIMIT:
            raise ValueError("Provider exceeded the reserved cost")
        result = openrouter.decode(provider, report)
        if cache_key(build_report(store, body.lap_a, body.lap_b)) != fingerprint:
            result = None  # recordings changed while the provider was working
    except Exception:
        # Never expose provider error bodies/keys, retry automatically or refund an uncertain charge.
        result = None
    finally:
        db.finish(fingerprint, call_id, result=result, cost=cost,
                  receipt_id=receipt_id, model=model)
    current = build_report(store, body.lap_a, body.lap_b)
    return view(current, db)
