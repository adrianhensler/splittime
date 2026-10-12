# WP-005: Corner comparison (M4)

| | |
|---|---|
| Status | partial; reviewed module merged in PR #10, stable reference and real two-lap accuracy criteria incomplete |
| Parent | WP-000 |
| Children | none |
| Worker | Codex (integration checkpoint owner); original module by Opus 5.5 |
| Verifier | GPT-6, via pull request review |
| Acceptor | owner |

Branch `feat/opus-corner-analysis`, PR #5. Contract:
[docs/CORNER_CONTRACT.md](../docs/CORNER_CONTRACT.md).

## Intent

Show where on the lap one driver gains or loses time against the other, corner
by corner, with the measurements behind it.

## Outcome

Each route has a fixed, numbered set of corners. Any two laps on that route get
a per-corner table of time and driving differences.

## Authority and limits

- May: add `app/corners/`, `tests/corners/`, the contract and records; adapt
  corner detection from Forza-6-telemetry `sections.py` at `523e8ba` with its
  notice.
- May not: change upstream code or anything GPT-6 owns (`app/main.py`,
  `app/api/`, `app/recorder/`, `app/telemetry/`, `app/static/`, `prototype/`);
  state causes or advice. The output is measurements.

## Acceptance criteria

1. Corners are derived once per route from a reference lap, so numbering is
   the same for every lap and both drivers.
2. For two laps the table gives, per corner: time delta, brake onset position,
   minimum speed, throttle application position and exit speed.
3. Corner time deltas plus straight deltas sum to the lap-time delta within
   0.05 s, on two real laps of one route.
4. Every figure can be traced to the plotted channels at that position.
5. Corners can be re-derived for a route without touching recorded data.
6. Adapted code is listed in `docs/UPSTREAM.md`.

Criterion 1's persisted stable reference/numbering is not implemented.
The comparison page for criterion 4 is wired into PR #10. Criterion 3 is met
on simulated pairs only; one real timed trace has been inspected, but there
is no validated real two-lap pair.

## Context

- `docs/CORNER_CONTRACT.md` (Proposed; four questions open for GPT-6)
- `docs/PARALLEL_BUILD.md`, `docs/REVIEW_HANDOFF_2026-10-12.md`
- `docs/upstream/wiki/FH6-Data-Out-Packet.md` for field meanings
- Forza-6-telemetry `app/sections.py` at `523e8ba`

## Claims

| # | Claim | Basis |
|---|---|---|
| C1 | On the simulator circuit the module finds its two corners within 4 m of their true positions, 120.0 m radius, same direction | E1, E2 |
| C2 | Corner count, direction and boundaries do not depend on which lap is the reference, on packet rate (60 vs 140/s), or on a reference lap driven far below the limit | E1 |
| C3 | Segments cover the shared lap with no gaps; their deltas sum to the total; residual against the game's lap-time difference is under 0.05 s (observed 0.002 to 0.010 s) | E1, E2, E3 |
| C4 | A hairpin, a right-left chicane and a flat-out sweeper are found and classified; a 10° kink and a two-frame landing spike are not corners | E1 |
| C5 | Thin, empty, mismatched, abandoned, mixed-clock or reset-clock input returns `comparable: false` with reasons and does not raise | E1 |
| C6 | Dropped frames mark the lap `discontinuous` and move segment times by under 0.02 s; a rewound stretch is discarded | E1 |
| C7 | Unmeasurable values are `null`, not 0 | E1 |
| C8 | Laps with a dead lap clock (World Time Attack) are timed on the race clock and say so | E1 |
| C9 | Route position need not be metres: a 2.45× scale gives the same radii, speeds and deltas | E1 |
| C10 | Isolated corner source changed no upstream/GPT-6-owned file and added no dependency | E4 at source `c29fdcc`; integration deliberately changes other modules |
| C11 | The endpoints work against a database recorded over real UDP from the simulator | E3 |
| C12 | Direction `R`/`L` matches the real game | `asserted` — from upstream's axis notes, not checked against a capture |
| C13 | The thresholds find sensible corners for real cars on real routes | `asserted` — untested |
| C14 | `DistanceTraveled` aligns two different cars on one route | `asserted` — from upstream's notes |

## Evidence

Ubuntu, Python 3.12.3. Head of `feat/opus-corner-analysis`.

| ID | What | How to re-run |
|---|---|---|
| E1 | 32 tests in `tests/corners/` pass; full suite passes on the integration branch (234 at `8128116`, which includes 11 record-guard tests) | `.venv/bin/pytest -q tests/corners` and `.venv/bin/pytest -q` |
| E2 | Detected vs true positions on the simulator: entries 603.2 / 1579.6 (true 600 / 1577), exits 973.3 / 1949.1 (true 977 / 1954), radius 120.0 | `test_simulator_circuit_has_its_two_known_corners`; true values from `tools/simulator.py` `STRAIGHT`, `RADIUS` |
| E3 | Against the database recorded in WP-001 E5: 2 corners, `capture_quality: continuous`, totals dt −0.273 s, lap-time dt −0.283 s, residual −0.010 s; about 150 ms per comparison | record a session as in `AGENTS.md`, then call `app.corners.api.corners_compare` with a stub request as `tests/corners/test_corners_api.py` does |
| E4 | Isolated source scope check | `git diff --stat ad4551b c29fdcc -- app/api app/recorder app/telemetry app/main.py app/static tools prototype requirements.txt` |
| E5 | CI on the pull request | PR #5 checks |

## Known, unknown, unproven

- **Known:** C1 to C11, as the worker's self-checks on synthetic data.
- **Unknown:**
  - Accuracy on real FH6 routes. One corrected copied trace reports 12 corners,
    zero timed-lap gaps and no clock warning; direction, boundaries and
    cross-car alignment are still not field-verified.
  - Whether heading from `yaw` is clean enough in the real game for a 30 m
    curvature window, and how drifting (yaw not along the path) affects it.
  - Cost on very long laps. A 29-minute lap of 119k frames is mentioned
    upstream; this code holds a whole lap in memory.
- **Unproven (assumed):** C12, C13, C14. Brake and throttle thresholds (10%,
  50%, three samples) are choices, not calibrated values.

## Unresolved

1. **No stable persisted reference**, by agreement for the POC. Corners are recomputed per request from the
   route's fastest clean lap, so numbering can shift if a new fastest lap
   finds a different set.
2. **Start/finish line.** A corner straddling the line shows as two parts.
3. **Chicanes.** The reversal blurs: about 5° of heading and a 9 m gap between
   the two halves go to a short "straight" segment.
4. **`kind`** uses the reference lap's speed, so it can differ between cars.
5. Upstream's `_LapScan` is not reused, to avoid importing a private name from
   a file GPT-6 owns. The rewind rule is reimplemented in `trace.py`; if the
   two ever disagree, charts and corner tables would differ slightly.

## Review round 1 (PR #5, 2026-10-12)

GPT-6 reviewed the contract at `2bb8fdc`, answered the four questions and asked
for refinements. It did not run the tests.

| Refinement | Response |
|---|---|
| Arrival time must never be a ranked timing basis | Done: any comparison resting on `arrival_time` is `comparable: false` with reason `arrival_time_unverified`; segments still returned. Test added. |
| Direction sign is unverified; do not present as fact | Done: every route result carries `direction_verified: false`. The sign rule is unchanged. |
| Reference lap may be rewound, cutoff or suspect | Done: fastest unflagged, unexcluded lap; falls back to fastest with a warning. Two tests added, one on upstream's dirty-lap scenario. |
| Distance is not metres; convert the 300 m windows | Already converted with `metres_per_unit`. Contract now says the scale is a lap average and approximate. |
| Include gap evidence | Done: `gaps` count in each lap summary. |
| Simulator passes are not field accuracy | Agreed; stated in Known/unknown above. |

## Review round 2 (PR #5, 2026-10-12)

GPT-6 and the Codex reviewer on `fc05b15`. Codex reproduced the second item.

| Finding | Response |
|---|---|
| A shared route row is not proof the laps ran the same event | Done: the HTTP endpoint adds `route_equivalence_unverified` to every response, so it never returns `comparable: true` until something verifies equivalence. Segments are still returned. Test changed and extended. |
| A clock that resets mid-lap gave `comparable: true` and a negative corner time | Done: `lap_clock_discontinuous`; each lap summary now carries its `warnings`. Test added with a mid-corner reset. |

Not covered: a clock that jumps *forward* mid-lap is not detected.

## Review round 3 (PR #10, 2026-10-12)

Codex automated review on `c3ac78a`: a `cutoff` lap whose visible flag a user
cleared could become the route's corner reference with no warning. Fixed by
Opus in `app/corners/api.py`: `pick_reference` reads the detector's
`flags_auto` for cutoff. Hand-cleared `contact` or `rewind` stay cleared, as
the user's judgment. Test extended in `test_reference_lap_prefers_clean_over_fast`.

## Checkpoint

Historical source review: Opus merged `c29fdcc` into PR #10 at
`7c81323`; both API safeguards and driver attribution are retained in code
head `f68d70a`. `app/main.py` includes the router and the rivalry page links
to `compare.html`. PR #10 merged at `0015f01`; source PR #5 was marked merged
when its commits landed through #10. See WP-003 for later deployment evidence.

Next: obtain a second real lap, verify a labelled known turn, check boundaries
and alignment, and persist a deliberate route reference before calling corner
numbering stable. Re-run `python -m pytest -q tests/corners`. No detector
threshold or live-recording changes follow from this checkpoint.

## Verification

GPT-6/Codex source reviews found arrival-time, equivalence and clock issues;
the fixes are recorded above. Opus ran 32 corner tests and reviewed the
integrated endpoint at `7c81323`; his final `f68d70a` review confirmed the
corner files were unchanged and the application had no blockers. Synthetic checks establish regression
behaviour, not real direction/accuracy or completion of the full packet.

## Acceptance

Reviewed corner POC admitted by PR #10's merge at `0015f01`. Stable references and real two-lap
acceptance checks remain open.
