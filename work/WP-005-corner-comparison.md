# WP-005: Corner comparison (M4)

| | |
|---|---|
| Status | draft |
| Parent | WP-000 |
| Children | none |
| Worker | — |
| Verifier | — |
| Acceptor | owner |

## Intent

Show where on the lap one driver gains or loses time against the other, corner
by corner, with the measurements behind it.

## Outcome

Each route has a fixed, numbered set of corners. Any two laps on that route get
a per-corner table of time and driving differences.

## Authority and limits

- May: add numpy; adapt corner detection from Forza-6-telemetry `sections.py`
  at `523e8ba` with its copyright notice; store corners with the route; add an
  API endpoint and a table on the analysis page.
- May not: state causes or advice. The output is measurements.

## Acceptance criteria

1. Corners are derived once per route from a reference lap and stored, so
   numbering is the same for every lap and both drivers.
2. For two laps the table gives, per corner: time delta, brake onset position,
   minimum speed, throttle application position and exit speed.
3. Corner time deltas plus straight deltas sum to the lap-time delta within
   0.05 s, on two real laps of one route.
4. Every figure can be traced to the plotted channels at that position.
5. Corners can be re-derived for a route without touching recorded data.
6. Adapted code is listed in `docs/UPSTREAM.md`.

## Context

- `docs/DESIGN.md` section 7
- `docs/UPSTREAM.md` (Forza-6-telemetry section)
- `docs/BUILD_PLAN.md` risk R6

## Claims

| # | Claim | Basis |
|---|---|---|

## Evidence

| ID | What | Where |
|---|---|---|

## Known, unknown, unproven

- **Known:** the source's corner sections are grouped by type per session, not
  fixed to a route.
- **Unknown:** whether its thresholds, tuned for tuning analysis, find the same
  corners for different cars and lines.

## Unresolved

None.

## Checkpoint

Not started. Depends on WP-004 being admitted.

## Verification

—

## Acceptance

—
