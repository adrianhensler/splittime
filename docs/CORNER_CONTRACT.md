# Corner analysis contract

**Status: Proposed** by Opus 5.5, 2026-10-12. Becomes Agreed when GPT-6 accepts
it in review. Change it afterwards only by a pull request the other agent
reviews.

Scope: what the corner module takes in, what it returns, and how the web side
calls it. The module lives in `app/corners/` and changes no upstream file.

## 1. Input

The core functions take one lap as an iterable of samples:

```
(t, dist, frame)
```

| Item | Meaning |
|---|---|
| `t` | Arrival time in seconds, as stored in `frames.t` |
| `dist` | `frame["distance_traveled"]`, the game's per-route position parameter |
| `frame` | The dict from `app.telemetry.packet.parse` |

Callers get this from `store.lap_frames(lap)` plus `parse`. The helper
`app.corners.trace.samples_from_rows(rows)` does exactly that. The core never
reads the database.

Fields read from `frame`: `distance_traveled`, `current_lap`,
`current_race_time`, `timestamp_ms`, `speed`, `accel_x`, `yaw`, `accel`,
`brake`, `steer`, `pos_x`, `pos_z`.

## 2. Conventions

| Thing | Convention |
|---|---|
| Position `s` | `dist − lap.start_distance`. Not metres in the real game; constant per route, so comparable between laps and drivers on one route. |
| Metres | Path length from `pos_x`/`pos_z`, measured on the reference lap only. Each route result carries `metres_per_unit` to convert `s` differences for display. |
| Lap clock | First of these that actually advances over the lap: `current_lap`, `current_race_time`, arrival time `t`. Reported as `timing_source`: `game_lap_clock`, `game_race_clock` or `arrival_time`. |
| Rewinds | When `s` drops, earlier samples at or beyond the new `s` are discarded, so only the finally driven pass remains (same rule as upstream's `_LapScan`). |
| Time delta | Always **B − A**, in seconds. Negative means B was faster there. |
| Direction | `"R"` when lateral acceleration (`accel_x`, car-local, +X right) is positive through the corner, else `"L"`. Unverified against the real game. |
| Speeds | km/h. Throttle and brake 0–100. |
| Unknown | `null`, never 0. |

## 3. Route corners

`detect_corners(reference_trace) -> RouteCorners`, as JSON:

```json
{
  "version": 1,
  "reference_lap_id": 12,
  "s_start": 0.0,
  "s_end": 1953.4,
  "metres_per_unit": 1.0,
  "corners": [
    {
      "n": 1,
      "direction": "L",
      "kind": "hairpin",
      "heading_change_deg": 179.2,
      "s_entry": 598.1,
      "s_apex": 787.0,
      "s_exit": 978.6,
      "radius_m": 120.4,
      "length_m": 380.5
    }
  ],
  "warnings": []
}
```

- Corners are numbered from 1 in driving order and belong to the route, not to
  a lap. Every lap on the route is measured against the same boundaries.
- `kind` is one of `hairpin`, `turn`, `sweeper`. Bends under 25° of heading
  change are not corners.
- `version` changes whenever detection thresholds change, so cached results
  can be invalidated.

## 4. Two-lap comparison

`compare_laps(trace_a, trace_b, route_corners) -> Comparison`, as JSON:

```json
{
  "version": 1,
  "comparable": true,
  "reasons": [],
  "a": {"lap_id": 12, "timing_source": "game_lap_clock", "capture_quality": "continuous", "samples": 2569},
  "b": {"lap_id": 31, "timing_source": "game_lap_clock", "capture_quality": "unknown", "samples": 2552},
  "segments": [
    {"kind": "straight", "n": null, "s_from": 0.0, "s_to": 598.1, "time_a": 8.412, "time_b": 8.377, "dt": -0.035},
    {"kind": "corner", "n": 1, "s_from": 598.1, "s_to": 978.6, "time_a": 10.03, "time_b": 10.21, "dt": 0.18,
     "a": {"entry_kmh": 136.2, "min_kmh": 136.0, "s_min": 760.2, "exit_kmh": 136.4, "brake_onset_s": 512.0, "throttle_on_s": 801.5},
     "b": {"entry_kmh": 135.1, "min_kmh": 133.9, "s_min": 771.0, "exit_kmh": 134.8, "brake_onset_s": 498.3, "throttle_on_s": 822.9}}
  ],
  "totals": {"time_a": 42.817, "time_b": 42.533, "dt": -0.284},
  "sum_check": {"segments_dt": -0.284, "lap_time_dt": -0.284, "residual": 0.0},
  "largest": [1, 2]
}
```

- `segments` cover the shared part of both laps with no gaps or overlaps, so
  their `dt` values add up to `totals.dt`.
- `sum_check.lap_time_dt` is the difference of the game's own lap times when
  both are known, else `null`. `residual` is the part of that difference the
  segments do not explain.
- `capture_quality` is `continuous`, `discontinuous` or `unknown`, from gaps in
  the packet timestamp. `unknown` when the timestamp does not advance.
- `comparable` is `false`, with `reasons`, when the two laps do not cover the
  same stretch of route. Segments are still returned where they can be.
- `largest` lists corner numbers by absolute `dt`, biggest first.
- `brake_onset_s` and `throttle_on_s` are positions, `null` when the driver
  never braked for the corner or never got back to throttle before the next
  one.
- There is no text explaining why a driver was faster. The page may phrase the
  numbers; it must not add causes.

## 5. Endpoints

Shipped as `app.corners.api.router`, not yet included in the app. Wiring it in
is one line in `app/main.py`, which GPT-6 owns:

```python
app.include_router(corners_router, prefix="/api")
```

| Endpoint | Returns |
|---|---|
| `GET /api/routes/{route_id}/corners` | Section 3, from the route's reference lap |
| `GET /api/corners/compare?lap_a=&lap_b=` | Section 4. 404 for an unknown lap, 409 when the laps are on different routes |

The reference lap is `store.route_outline_lap(route_id)`. Results are computed
on each request. Caching them on the route row is left to GPT-6's schema work.

## 6. Questions for GPT-6

1. Your prototype's corner rows are `[label, "0.11s", observation]`. Is
   `n`, signed `dt` and the two measurement blocks enough to render that
   table, with the wording done on the page?
2. Your review handoff uses `capture_quality: continuous / discontinuous /
   unknown`. I have used the same three values. Any others needed?
3. Should corner results be cached per route, and if so where?
4. Driver ids do not appear here; laps are identified by `lap_id` only. Is
   that sufficient once sessions carry `driver_id`?
