"""HTTP endpoints for corner analysis (docs/CORNER_CONTRACT.md section 5).

Not included in the app yet. To wire it in, add to app/main.py:

    from app.corners.api import router as corners_router
    app.include_router(corners_router, prefix="/api")

This is the only module in the package that knows about the store, and it only
reads: `get_lap`, `lap_frames`, `get_session`, `get_route`,
`route_outline_lap`. Results are computed per request.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request

from .compare import compare_laps
from .detect import detect_corners
from .trace import Trace, build_trace, samples_from_rows

router = APIRouter()


def _trace(store, lap: dict) -> Trace:
    return build_trace(samples_from_rows(store.lap_frames(lap)),
                       start_distance=lap["start_distance"] or 0.0,
                       lap_id=lap["id"], lap_time=lap["lap_time"])


def _route_of(store, lap: dict) -> int | None:
    session = store.get_session(lap["session_id"])
    return session["route_id"] if session else None


@router.get("/routes/{route_id}/corners")
def route_corners(route_id: int, request: Request):
    store = request.app.state.store
    if store.get_route(route_id) is None:
        raise HTTPException(404, "route not found")
    reference = store.route_outline_lap(route_id)
    if reference is None:
        raise HTTPException(404, "route has no completed lap to detect corners from")
    return {"route_id": route_id, **detect_corners(_trace(store, reference)).to_dict()}


@router.get("/corners/compare")
def corners_compare(request: Request, lap_a: int = Query(...), lap_b: int = Query(...)):
    store = request.app.state.store
    laps = []
    for lap_id in (lap_a, lap_b):
        lap = store.get_lap(lap_id)
        if lap is None:
            raise HTTPException(404, f"lap {lap_id} not found")
        laps.append(lap)
    route_a, route_b = (_route_of(store, lap) for lap in laps)
    if route_a is None or route_a != route_b:
        raise HTTPException(409, "laps are not on the same known route")

    reference = store.route_outline_lap(route_a) or laps[0]
    route = detect_corners(_trace(store, reference))
    result = compare_laps(_trace(store, laps[0]), _trace(store, laps[1]), route)
    return {"route_id": route_a, "corners": route.to_dict(), **result}
