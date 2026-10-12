# WP-002: Two drivers (M1)

| | |
|---|---|
| Status | reviewed two-driver POC merged in PR #10; real two-driver field validation remains in WP-003 |
| Parent | WP-000 |
| Children | none |
| Worker | Codex (checkpoint owner); original implementation by GPT-6 |
| Verifier | Opus 5.5: adverse re-check and final application review at `f68d70a` |
| Acceptor | owner |

## Intent

Make the recorder attribute every session to one of two drivers by the UDP port
it arrived on.

## Outcome

Two listeners and two trackers in one process, one shared database with a
driver on every session, and per-driver bests.

## Authority and limits

- May: add configuration, a schema migration, a listener and tracker per
  driver, and API fields; extend the simulator and tests.
- May not: change detection thresholds; weaken or delete upstream scenario
  tests; build rivalry views (WP-004); use sudo.

## Acceptance criteria

1. Driver names and ports come from configuration; the variable names are
   documented in `docs/SETUP.md`.
2. A migration adds `drivers`, `sessions.driver_id` and `sessions.source_addr`,
   and an existing single-driver database upgrades without loss.
3. Two simulators sending at once to two ports from the same address produce
   sessions attributed to the right drivers (acceptance check 2).
4. One driver's bests, live state and session boundaries are unaffected by the
   other's traffic.
5. A 3-lap race abandoned on lap 3 keeps two laps and invents nothing
   (acceptance check 4).
6. Wrong-size packets are counted per port and visible in the status endpoint.
7. A source address change within a session is logged.
8. All upstream scenario tests still pass.

## Context

- `docs/DESIGN.md` sections 3, 5, 6
- `docs/ADR.md` entries 4 and 9
- Upstream `app/main.py`, `app/telemetry/listener.py`, `app/recorder/store.py`

## Claims

Final application snapshot at `f68d70a`; live discussion is in PR #10.

| # | Claim | Basis |
|---|---|---|
| C1 | Config, source tracking and isolation repairs pass independent adverse checks | E1, E3 |
| C2 | First-start repair keeps game time/contact and removes the observed false rewind on copied replay | E2, E3; Codex inspected private packets and owner supplied ground truth |

## Evidence

| ID | What | Where |
|---|---|---|
| E1 | Driver regressions | `python -m pytest -q tests/test_driver_review.py tests/test_multi_driver.py`; `node --test tests/ui/driver-groups.test.cjs` |
| E2 | Start regression | `python -m pytest -q tests/test_rivals_start.py`; reset test fails against parent of `175bffe` |
| E3 | Independent 223 Python/12 UI and 18/19 adverse checks | [Opus final review](https://github.com/adrianhensler/splittime/pull/10#pullrequestreview-5490170368) |

## Known, unknown, unproven

- **Known:** `SessionTracker` keeps state per instance (WP-000 C3).
- **Known on simulated inputs:** driver isolation, migration and repaired
  configuration/source handling have tests and independent review.
- **Unknown:** ordinary use by two real drivers over internet delivery.

## Unresolved

Real two-driver field checks remain unverified; the shared deployment is
recorded in WP-003. Review also reported an
inherited detector issue: out-of-order UDP near a lap boundary can duplicate
laps. Detector changes require a capture and remain separate from these fixes.

## Checkpoint

Historical source checkpoint: baseline was merged at `ad4551b`. Branch `feat/gpt6-two-driver-backend`,
[PR #6](https://github.com/adrianhensler/splittime/pull/6), holds implementation
and the live review record. Repairs cover atomic port changes, driver-scoped
grouping and bounded source tracking. Reproducer regressions are
`tests/test_driver_review.py` and `tests/ui/driver-groups.test.cjs`;
six Python cases failed before the fix. Re-run
`python -m pytest -q tests/test_driver_review.py tests/test_multi_driver.py`
and `node --test tests/ui/driver-groups.test.cjs`.
These repairs are included in integration code head `f68d70a`; propagation
through PR #7 and final application review are done. PR #10 subsequently merged
at `0015f01`; source PR #6 was marked merged when its commits landed through
#10. The reviewed integration is
admitted under ADR 20. Shared deployment evidence is in WP-003.
Next: validate fresh real captures from both drivers and the remaining field
matrix in WP-003; the historical integration step is complete.

## Verification

Own repair checks: 23 focused Python tests and two Node grouping tests passed.
Opus independently confirmed the configuration, source and isolation repairs
on `7c81323`; his combined 19 adverse tests passed 18, with only inherited UDP
reordering failing. His final `f68d70a` review checked the first-start predicate:
eight of nine new tests pass; a hypothetical reset one frame after crossing
still falsely marks a clean lap suspect. Do not widen without capture evidence.
These are historical source-review results. Integration admission is the
reviewed PR #10 merge; later deployment verification is recorded in WP-003.

## Acceptance

Reviewed two-driver POC and source repairs admitted by PR #10's merge at
`0015f01`. Full real-use criteria remain separate open checks in WP-003.

## Integration checkpoint, 2026-10-12

First real user-confirmed Rivals capture: one game-reported lap of 150.807556 s,
1970 GMC Jimmy C500, wall contact and no rewind. A false rewind arose from the
first start-line CurrentLap reset while approaching from negative route position.
The narrow re-anchor repair has a sanitized regression in `tests/test_rivals_start.py`.
Replaying separate copies removes false rewind and clock warnings, retains
contact and the exact lap time. Live data is untouched; no raw capture is in Git.
Capture-derived validation is limited to this one run, not cross-driver fairness.

Repair commit `8ab5ee2` from PR #6 is now included in the PR #10 branch through
the repaired PR #7 merge `8684f17`, then merged to main in
[PR #10](https://github.com/adrianhensler/splittime/pull/10) at `0015f01`.
The earlier `3ed8f6c` checkpoint predates these review fixes. Later deployment
is recorded in WP-003. Prior recovery-only results are preserved in the Workpacket
takeaways and the PR history.
