"""HTTP endpoints for corner analysis (docs/CORNER_CONTRACT.md section 5).

Included in app.main under /api; the rivalry page links to compare.html.

This is the only module in the package that knows about the store, and it only
reads: `get_lap`, `lap_frames`, `get_session`, `get_route`, `session_laps`
and one SELECT through `reader()`. Results are computed per request.

The compare endpoint never returns `comparable: true` for now; see
ROUTE_EQUIVALENCE_VERIFIED.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request

from .compare import compare_laps
from .detect import detect_corners
from .trace import Trace, build_trace, samples_from_rows

router = APIRouter()

# Two laps sharing a route row only share the recorder's fingerprint: start
# position, length and bounding box. That does not prove the same direction,
# checkpoints or event rules, and nothing in the app verifies those yet. Until
# something does, every comparison served over HTTP is exploratory.
ROUTE_EQUIVALENCE_VERIFIED = False


def _trace(store, lap: dict) -> Trace:
    return build_trace(samples_from_rows(store.lap_frames(lap)),
                       start_distance=lap["start_distance"] or 0.0,
                       lap_id=lap["id"], lap_time=lap["lap_time"])


def pick_reference(laps: list[dict]) -> tuple[dict | None, list[str]]:
    """The lap corners are detected from: the fastest timed lap that is not
    flagged (rewind, contact, cutoff) and not excluded by a user edit. When
    every lap on the route is flagged the fastest one is used anyway, with a
    warning, so the page can still show something and say what it rests on.

    A detector `cutoff` counts even after a user clears the visible flag
    (`flags_auto` keeps it): the lap's time is an estimate and its trace stops
    short, and an edit to what is displayed does not change either."""
    timed = sorted((lap for lap in laps if lap.get("lap_time") is not None),
                   key=lambda lap: lap["lap_time"])
    if not timed:
        return None, []

    def cut_off(lap: dict) -> bool:
        return "cutoff" in (lap.get("flags_auto") or "").split(",")

    for lap in timed:
        if not lap.get("flags") and not lap.get("excluded") and not cut_off(lap):
            return lap, []
    lap = timed[0]
    why = lap.get("flags") or ("cutoff (flag cleared by hand)" if cut_off(lap) else "excluded")
    return lap, [f"no clean lap on this route; reference lap {lap['id']} is flagged: {why}"]


def _reference(store, route_id: int) -> tuple[dict | None, list[str]]:
    with store.reader() as conn:
        session_ids = [row[0] for row in conn.execute(
            "SELECT id FROM sessions WHERE route_id = ?", (route_id,))]
    laps = [lap for sid in session_ids for lap in store.session_laps(sid)]  # edits applied
    return pick_reference(laps)


def _detect(store, reference: dict, warnings: list[str]):
    route = detect_corners(_trace(store, reference))
    route.warnings[:0] = warnings
    return route


def _route_of(store, lap: dict) -> int | None:
    session = store.get_session(lap["session_id"])
    return session["route_id"] if session else None


@router.get("/routes/{route_id}/corners")
def route_corners(route_id: int, request: Request):
    store = request.app.state.store
    if store.get_route(route_id) is None:
        raise HTTPException(404, "route not found")
    reference, warnings = _reference(store, route_id)
    if reference is None:
        raise HTTPException(404, "route has no completed lap to detect corners from")
    return {"route_id": route_id, **_detect(store, reference, warnings).to_dict()}


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

    reference, warnings = _reference(store, route_a)
    route = _detect(store, reference or laps[0], warnings)
    result = compare_laps(_trace(store, laps[0]), _trace(store, laps[1]), route)
    if not ROUTE_EQUIVALENCE_VERIFIED:
        result["reasons"].append("route_equivalence_unverified")
        result["comparable"] = False
    names = {d.id: d.name for d in getattr(request.app.state, "drivers", ())}
    for side, lap in zip(("a", "b"), laps):
        session = store.get_session(lap["session_id"])
        driver_id = session.get("driver_id") or "legacy"
        result[side].update(driver_id=driver_id,
                            driver_name=names.get(driver_id, driver_id),
                            car_pi=session.get("car_pi"))
    return {"route_id": route_a, "corners": route.to_dict(), **result}
