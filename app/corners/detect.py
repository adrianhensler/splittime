"""Find the corners of a route from one reference lap.

Corners belong to the route: they are detected once, numbered in driving
order, and every other lap is measured against the same boundaries.

A stretch counts as cornering when the path itself bends tightly (curvature,
from the change of heading per metre of path) or when the reference lap pulled
real lateral g through it. Geometry catches a tight corner however slowly the
reference lap took it; lateral g catches a fast sweeper whose radius alone
looks gentle.

The lateral-g criterion, the minimum heading change and the hairpin / turn /
sweeper classification are adapted from `app/sections.py` in
ClickClickMedia/Forza-6-telemetry at 523e8ba (MIT, (c) 2026 ClickClickMedia;
see THIRD_PARTY_NOTICES.md). That code groups corners by type across a
session; fixing numbered corners to a route position is new here.

All thresholds are module constants. Bump VERSION when any of them changes.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field

from .trace import Trace

VERSION = 1
G = 9.80665

# --- geometry -------------------------------------------------------------
CURV_WINDOW_M = 30.0        # heading change is measured over this much path
ENTER_RADIUS_M = 400.0      # tighter than this is cornering whatever the speed
EXIT_RADIUS_M = 600.0       # hysteresis: stay in the corner until gentler than this
# --- lateral g (Forza-6-telemetry: CORNER_LAT_G) --------------------------
ENTER_LAT_G = 0.30
EXIT_LAT_G = 0.20
LAT_SMOOTH_M = 15.0
# --- shaping --------------------------------------------------------------
MERGE_GAP_M = 30.0          # same-direction spans closer than this are one corner
MIN_LENGTH_M = 15.0
MIN_HEADING_DEG = 25.0      # less net heading change is a kink (TURN_MIN_HEADING_DEG)
MIN_SAMPLES = 50            # a reference lap shorter than this is not analysed
# The curvature window pads each end of a span with up to half a window of
# straight. Ends are pulled in to where the heading has actually started to
# change by this much, so boundaries and radius reflect the bend itself.
TRIM_HEADING_DEG = 1.5
# --- classification (Forza-6-telemetry) -----------------------------------
HAIRPIN_MIN_HEADING_DEG = 100.0
HAIRPIN_MAX_MIN_KMH = 60.0
SWITCHBACK_MIN_HEADING_DEG = 150.0
SWITCHBACK_MAX_MIN_KMH = 90.0
SWEEPER_MIN_AVG_KMH = 120.0
SWEEPER_MIN_KMH = 90.0
SWEEPER_MIN_S = 2.5


@dataclass
class Corner:
    n: int
    direction: str
    kind: str
    heading_change_deg: float
    s_entry: float
    s_apex: float
    s_exit: float
    radius_m: float | None
    length_m: float


@dataclass
class RouteCorners:
    version: int = VERSION
    reference_lap_id: int | None = None
    s_start: float | None = None
    s_end: float | None = None
    metres_per_unit: float | None = None
    # R/L comes from the sign of car-local lateral acceleration, a rule taken
    # from upstream's axis notes and not yet checked against a real capture.
    # Flip to True only with that evidence.
    direction_verified: bool = False
    corners: list[Corner] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        out = asdict(self)
        for key in ("s_start", "s_end"):
            if out[key] is not None:
                out[key] = round(out[key], 2)
        if out["metres_per_unit"] is not None:
            out["metres_per_unit"] = round(out["metres_per_unit"], 5)
        for c in out["corners"]:
            for key in ("s_entry", "s_apex", "s_exit"):
                c[key] = round(c[key], 2)
            c["heading_change_deg"] = round(c["heading_change_deg"], 1)
            c["length_m"] = round(c["length_m"], 1)
            if c["radius_m"] is not None:
                c["radius_m"] = round(c["radius_m"], 1)
        return out


def _windowed(m: list[float], values: list[float], window: float, *, slope: bool) -> list[float]:
    """Per sample, over the path window centred on it: the slope of `values`
    against metres (slope=True) or their mean (slope=False)."""
    n = len(m)
    out = [0.0] * n
    half = window / 2
    lo = hi = 0
    acc = 0.0  # running sum of values[lo..hi) for the mean
    for i in range(n):
        while hi < n and m[hi] <= m[i] + half:
            acc += values[hi]
            hi += 1
        while m[lo] < m[i] - half:
            acc -= values[lo]
            lo += 1
        if slope:
            span = m[hi - 1] - m[lo]
            out[i] = (values[hi - 1] - values[lo]) / span if span > 1e-6 else 0.0
        else:
            out[i] = acc / (hi - lo)
    return out


def _classify(heading_deg: float, min_kmh: float, avg_kmh: float, seconds: float) -> str:
    if ((heading_deg >= HAIRPIN_MIN_HEADING_DEG and min_kmh < HAIRPIN_MAX_MIN_KMH)
            or (heading_deg >= SWITCHBACK_MIN_HEADING_DEG and min_kmh < SWITCHBACK_MAX_MIN_KMH)):
        return "hairpin"
    if (avg_kmh >= SWEEPER_MIN_AVG_KMH and min_kmh >= SWEEPER_MIN_KMH
            and seconds >= SWEEPER_MIN_S):
        return "sweeper"
    return "turn"


def detect_corners(ref: Trace) -> RouteCorners:
    """Corners of the route `ref` was driven on. Never raises on thin input:
    a trace too short to analyse returns no corners and a warning."""
    out = RouteCorners(reference_lap_id=ref.lap_id)
    out.warnings.extend(ref.warnings)
    n = len(ref)
    if n:
        out.s_start, out.s_end = ref.s[0], ref.s[-1]
    if n < MIN_SAMPLES or ref.m[-1] <= 0 or ref.s[-1] <= ref.s[0]:
        out.warnings.append("reference lap too short to detect corners")
        return out
    out.metres_per_unit = ref.m[-1] / (ref.s[-1] - ref.s[0])
    if ref.capture_quality == "discontinuous":
        out.warnings.append("reference lap has capture gaps; corner positions may be off")

    m = ref.m
    curv = _windowed(m, ref.yaw, CURV_WINDOW_M, slope=True)          # rad per metre
    lat_g = [v / G for v in _windowed(m, ref.lat, LAT_SMOOTH_M, slope=False)]

    def strength(i: int, radius: float, g: float) -> bool:
        return abs(curv[i]) >= 1.0 / radius or abs(lat_g[i]) >= g

    # 1. hysteresis spans of one turning direction
    spans: list[list[int]] = []  # [first, last, sign]
    current: list[int] | None = None
    for i in range(n):
        sign = 1 if curv[i] > 0 else -1
        if current is not None:
            if sign == current[2] and strength(i, EXIT_RADIUS_M, EXIT_LAT_G):
                current[1] = i
                continue
            spans.append(current)
            current = None
        if strength(i, ENTER_RADIUS_M, ENTER_LAT_G):
            current = [i, i, sign]
    if current is not None:
        spans.append(current)

    # 2. merge same-direction spans separated by a short straight
    merged: list[list[int]] = []
    for span in spans:
        if merged and merged[-1][2] == span[2] and m[span[0]] - m[merged[-1][1]] < MERGE_GAP_M:
            merged[-1][1] = span[1]
        else:
            merged.append(span)

    # 3. keep real corners, measure and classify them
    trim = math.radians(TRIM_HEADING_DEG)
    for first, last, _sign in merged:
        while first < last and abs(ref.yaw[first + 1] - ref.yaw[first]) < 1e-9:
            first += 1  # not turning at all yet
        start_yaw, end_yaw = ref.yaw[first], ref.yaw[last]
        while first < last and abs(ref.yaw[first] - start_yaw) < trim:
            first += 1
        while last > first and abs(end_yaw - ref.yaw[last]) < trim:
            last -= 1
        length = m[last] - m[first]
        heading = abs(ref.yaw[last] - ref.yaw[first])
        heading_deg = math.degrees(heading)
        if length < MIN_LENGTH_M or heading_deg < MIN_HEADING_DEG:
            continue
        idx = range(first, last + 1)
        peak = max(abs(curv[i]) for i in idx)
        plateau = [i for i in idx if abs(curv[i]) >= 0.95 * peak]
        apex = plateau[len(plateau) // 2]
        speeds = [ref.speed[i] * 3.6 for i in idx]
        mean_lat = sum(ref.lat[i] for i in idx) / len(idx)
        out.corners.append(Corner(
            n=len(out.corners) + 1,
            direction="R" if mean_lat > 0 else "L",
            kind=_classify(heading_deg, min(speeds), sum(speeds) / len(speeds),
                           ref.clock[last] - ref.clock[first]),
            heading_change_deg=heading_deg,
            s_entry=ref.s[first], s_apex=ref.s[apex], s_exit=ref.s[last],
            radius_m=length / heading if heading > 1e-6 else None,
            length_m=length,
        ))
    return out
