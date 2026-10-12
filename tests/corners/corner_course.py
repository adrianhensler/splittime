"""A small course generator for corner tests.

The upstream simulator only has one circuit with two identical corners. This
builds other shapes (hairpin, chicane, kink) and hostile input, emitting the
contract's `(t, dist, frame)` samples directly.
"""

from __future__ import annotations

import math

from app.corners import build_trace, samples_from_rows


def trace_of(store, lap: dict):
    return build_trace(samples_from_rows(store.lap_frames(lap)),
                       start_distance=lap["start_distance"] or 0.0,
                       lap_id=lap["id"], lap_time=lap["lap_time"])


class Course:
    """A path made of pieces: ("straight", metres) or ("arc", radius_m, degrees),
    positive degrees turning right. `drive()` returns one lap's samples."""

    def __init__(self, *pieces, units_per_metre: float = 1.0):
        self.pieces = pieces
        self.units_per_metre = units_per_metre

    def curvature(self, metres: float) -> float:
        at = 0.0
        for piece in self.pieces:
            length = piece[1] if piece[0] == "straight" else abs(math.radians(piece[2])) * piece[1]
            if metres < at + length:
                if piece[0] == "straight":
                    return 0.0
                return math.copysign(1.0 / piece[1], piece[2])
            at += length
        return 0.0

    @property
    def length(self) -> float:
        return sum(p[1] if p[0] == "straight" else abs(math.radians(p[2])) * p[1]
                   for p in self.pieces)

    def drive(self, *, rate: float = 60.0, top: float = 60.0, grip: float = 12.0,
              pace: float = 1.0, lap_clock: bool = True, race_clock: bool = True,
              timestamps: bool = True, start_dist: float = 0.0,
              origin: tuple[float, float] = (0.0, 0.0)) -> list[tuple[float, float, dict]]:
        """Drive the course at `pace` (1.0 = the reference pace): slow to each
        corner's grip-limited speed, brake before it, accelerate after."""
        dt = 1.0 / rate
        total = self.length

        def limit(metres: float) -> float:
            k = abs(self.curvature(metres))
            return top * pace if k < 1e-9 else min(top, math.sqrt(grip / k)) * pace

        x, z = origin
        yaw = metres = t = 0.0
        v = limit(0.0)
        out = []
        while metres < total:
            # look ahead for the slowest point we must be able to brake to
            target = limit(metres)
            for ahead in range(5, 260, 5):
                need = limit(metres + ahead)
                reachable = math.sqrt(need * need + 2 * 11.0 * ahead)
                target = min(target, reachable)
            if v > target + 0.05:
                lon = -min(11.0, (v - target) / dt)
            elif v < target - 0.05:
                lon = min(5.0, (target - v) / dt)
            else:
                lon = 0.0
            v = max(5.0, v + lon * dt)
            k = self.curvature(metres)
            yaw += v * k * dt
            x += math.sin(yaw) * v * dt
            z += math.cos(yaw) * v * dt
            metres += v * dt
            t += dt
            throttle = 255 if lon > 0 else (60 if lon == 0 else 0)
            brake = int(min(255, -lon / 11.0 * 255)) if lon < 0 else 0
            wrapped = math.atan2(math.sin(yaw), math.cos(yaw))
            frame = {
                "distance_traveled": start_dist + metres * self.units_per_metre,
                "current_lap": t if lap_clock else 0.0,
                "current_race_time": 30.0 + t if race_clock else 0.0,
                "timestamp_ms": int(t * 1000) if timestamps else 0,
                "speed": v, "accel_x": v * v * k, "yaw": wrapped,
                "accel": throttle, "brake": brake, "steer": 0,
                "pos_x": x, "pos_z": z,
            }
            out.append((1000.0 + t, frame["distance_traveled"], frame))
        return out
