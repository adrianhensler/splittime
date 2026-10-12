"""One lap as parallel arrays, indexed by route position.

Input is the `(t, dist, frame)` stream described in docs/CORNER_CONTRACT.md.
Everything downstream (detection, comparison) works on a `Trace` and never on
raw packets.
"""

from __future__ import annotations

import math
from bisect import bisect_left
from dataclasses import dataclass, field
from typing import Iterable, Iterator

from app.telemetry.packet import parse

# a clock counts as running when it advances at least this much over the lap
CLOCK_MIN_SPAN_S = 0.25
# DistanceTraveled is float32: tiny backward steps are noise, not a rewind
REWIND_EPS = 0.01
# a single-frame position step longer than this is a teleport, not driving
TELEPORT_M = 50.0
# packet-timestamp gap that marks the capture discontinuous. Not every gap is
# packet loss - a pause or a focus change looks the same - so it is reported
# as "discontinuous", never as "lost".
GAP_MIN_S = 0.25
GAP_MEDIAN_FACTOR = 5.0
_TS_WRAP = 1 << 32

Sample = tuple[float, float, dict]


def samples_from_rows(rows: Iterable[tuple[float, bytes]]) -> Iterator[Sample]:
    """`store.lap_frames(lap)` rows -> the contract's `(t, dist, frame)`."""
    for t, raw in rows:
        frame = parse(raw)
        yield t, frame["distance_traveled"], frame


@dataclass
class Trace:
    lap_id: int | None = None
    lap_time: float | None = None       # the game's own time for the lap, if known
    timing_source: str = "arrival_time"
    capture_quality: str = "unknown"
    gaps: list[dict] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    s: list[float] = field(default_factory=list)       # route position
    clock: list[float] = field(default_factory=list)   # seconds on timing_source
    m: list[float] = field(default_factory=list)       # path metres from first sample
    speed: list[float] = field(default_factory=list)   # m/s
    lat: list[float] = field(default_factory=list)     # m/s^2, +right
    yaw: list[float] = field(default_factory=list)     # rad, unwrapped
    throttle: list[float] = field(default_factory=list)  # 0-100
    brake: list[float] = field(default_factory=list)     # 0-100
    x: list[float] = field(default_factory=list)
    z: list[float] = field(default_factory=list)

    def __len__(self) -> int:
        return len(self.s)

    def at(self, values: list[float], s: float) -> float | None:
        """`values` linearly interpolated at route position `s`, clamped to
        the ends. None for an empty trace."""
        n = len(self.s)
        if n == 0:
            return None
        if s <= self.s[0]:
            return values[0]
        if s >= self.s[-1]:
            return values[-1]
        hi = bisect_left(self.s, s)
        lo = hi - 1
        s0, s1 = self.s[lo], self.s[hi]
        if s1 <= s0:
            return values[hi]
        f = (s - s0) / (s1 - s0)
        return values[lo] + (values[hi] - values[lo]) * f

    def clock_at(self, s: float) -> float | None:
        return self.at(self.clock, s)

    def index_range(self, s_from: float, s_to: float) -> range:
        """Indices of samples with s_from <= s <= s_to."""
        lo = bisect_left(self.s, s_from)
        hi = bisect_left(self.s, s_to)
        while hi < len(self.s) and self.s[hi] <= s_to:
            hi += 1
        return range(lo, hi)


def _unwrap(angles: list[float]) -> list[float]:
    out: list[float] = []
    offset = 0.0
    prev = None
    for a in angles:
        if prev is not None:
            step = a - prev
            if step > math.pi:
                offset -= math.tau
            elif step < -math.pi:
                offset += math.tau
        out.append(a + offset)
        prev = a
    return out


def _pick_clock(lap: list[float], race: list[float], arrival: list[float]) -> tuple[str, list[float]]:
    for name, values in (("game_lap_clock", lap), ("game_race_clock", race)):
        if values and max(values) - min(values) >= CLOCK_MIN_SPAN_S:
            return name, values
    return "arrival_time", arrival


def _capture_quality(ts: list[int], s: list[float]) -> tuple[str, list[dict]]:
    steps = [((b - a) % _TS_WRAP) / 1000.0 for a, b in zip(ts, ts[1:])]
    moving = sorted(d for d in steps if d > 0)
    if not moving:
        return "unknown", []  # the timestamp never advanced (simulated capture)
    limit = max(GAP_MIN_S, GAP_MEDIAN_FACTOR * moving[len(moving) // 2])
    gaps = [{"s": round(s[i + 1], 2), "seconds": round(d, 3)}
            for i, d in enumerate(steps) if d > limit]
    return ("discontinuous" if gaps else "continuous"), gaps


def build_trace(samples: Iterable[Sample], *, start_distance: float = 0.0,
                lap_id: int | None = None, lap_time: float | None = None) -> Trace:
    """Fold a lap's samples into a `Trace`.

    A rewind scrubs DistanceTraveled backwards; the samples it rewound over
    are dropped so only the finally-driven pass remains - the rule upstream's
    `_LapScan` applies, which also keeps the game clocks monotonic.
    """
    kept: list[tuple[float, float, dict]] = []  # (s, t, frame)
    for t, dist, frame in samples:
        s = dist - start_distance
        if kept and s < kept[-1][0] - REWIND_EPS:
            while kept and kept[-1][0] >= s:
                kept.pop()
        kept.append((s, t, frame))

    trace = Trace(lap_id=lap_id, lap_time=lap_time)
    if not kept:
        return trace

    source, clock = _pick_clock([p["current_lap"] for _, _, p in kept],
                                [p["current_race_time"] for _, _, p in kept],
                                [t for _, t, _ in kept])
    # Lap boundaries are inclusive in the store, so the first frame of a lap can
    # still carry the previous lap's clock and the last one the next lap's
    # (already reset to ~0). Both would turn a segment time negative.
    first, last = 0, len(kept)
    while first + 1 < last and clock[first] > clock[first + 1]:
        first += 1
    while last - 1 > first and clock[last - 1] < clock[last - 2]:
        last -= 1
    kept, clock = kept[first:last], list(clock[first:last])
    if any(later < earlier for earlier, later in zip(clock, clock[1:])):
        trace.warnings.append("lap clock runs backwards mid-lap; segment times are unreliable")

    trace.timing_source = source
    trace.clock = list(clock)
    trace.s = [s for s, _, _ in kept]
    frames = [p for _, _, p in kept]
    trace.speed = [p["speed"] for p in frames]
    trace.lat = [p["accel_x"] for p in frames]
    trace.yaw = _unwrap([p["yaw"] for p in frames])
    trace.throttle = [p["accel"] / 2.55 for p in frames]
    trace.brake = [p["brake"] / 2.55 for p in frames]
    trace.x = [p["pos_x"] for p in frames]
    trace.z = [p["pos_z"] for p in frames]

    total = 0.0
    teleports = 0
    trace.m = [0.0]
    for i in range(1, len(frames)):
        step = math.hypot(trace.x[i] - trace.x[i - 1], trace.z[i] - trace.z[i - 1])
        if step > TELEPORT_M:
            teleports += 1
            step = 0.0
        total += step
        trace.m.append(total)
    if teleports:
        trace.warnings.append(f"{teleports} position jump(s) over {TELEPORT_M:.0f} m ignored")

    trace.capture_quality, trace.gaps = _capture_quality(
        [int(p["timestamp_ms"]) for p in frames], trace.s)
    return trace
