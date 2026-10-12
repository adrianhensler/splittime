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
      "direction": "R",
      "kind": "sweeper",
      "heading_change_deg": 176.7,
      "s_entry": 603.2,
      "s_apex": 788.6,
      "s_exit": 973.3,
      "radius_m": 120.0,
      "length_m": 370.1
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
- Boundaries sit where the heading has changed by 1.5° from the corner's start
  or end, so they fall a few metres inside the geometric bend (about 3 m for a
  120 m radius, 8 m for 300 m).
- `kind` uses the reference lap's speed, so it can differ between cars. Number,
  direction and boundaries do not.
- A corner that straddles the start/finish line of a circuit is not joined up:
  it appears as a part at the end of the lap and a part at the start.

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
    {"kind": "straight", "n": null, "s_from": 0.0, "s_to": 603.48, "time_a": 11.77, "time_b": 11.167, "dt": -0.603},
    {"kind": "corner", "n": 1, "s_from": 603.48, "s_to": 973.33, "time_a": 9.869, "time_b": 9.983, "dt": 0.114,
     "a": {"entry_kmh": 134.9, "min_kmh": 134.8, "s_min": 651.9, "exit_kmh": 134.8, "brake_onset_s": 381.8, "throttle_on_s": 977.6},
     "b": {"entry_kmh": 133.5, "min_kmh": 133.4, "s_min": 652.1, "exit_kmh": 133.4, "brake_onset_s": 381.6, "throttle_on_s": 978.2}}
  ],
  "totals": {"time_a": 42.783, "time_b": 42.51, "dt": -0.273},
  "sum_check": {"segments_dt": -0.273, "lap_time_dt": -0.283, "residual": -0.01},
  "largest": [2, 1]
}
```

- `segments` cover the shared part of both laps with no gaps or overlaps, so
  their `dt` values add up to `totals.dt`.
- `sum_check.lap_time_dt` is the difference of the game's own lap times when
  both are known, else `null`. `residual` is the part of that difference the
  segments do not explain.
- `capture_quality` is `continuous`, `discontinuous` or `unknown`, from gaps in
  the packet timestamp. `unknown` when the timestamp does not advance.
- `comparable` is `false`, with `reasons`, when the laps should not be scored
  against each other. Segments are still returned where they can be, for an
  exploratory look. Reasons: `too_few_samples`, `no_shared_distance`,
  `laps_cover_different_distance`, `different_start_position`,
  `different_timing_source`.
- A corner cut off by the end of a lap carries `"partial": true`.
- Each lap misses up to one frame at each end, so `residual` is normally a few
  hundredths of a second, not zero.
- `largest` lists corner numbers by absolute `dt`, biggest first.
- `brake_onset_s`: first position, from up to 300 m before the corner to its
  apex, where brake stays at 10% or more for three samples. `null` when the
  driver never braked for the corner.
- `throttle_on_s`: first position at or after the slowest point where throttle
  stays at 50% or more for three samples, looking up to 300 m past the exit.
  `null` when that never happens before the next corner.
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
