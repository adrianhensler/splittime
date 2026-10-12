# WP-002: Two drivers (M1)

| | |
|---|---|
| Status | in-progress; implementation in PR #6, integrated for testing in draft PR #10 |
| Parent | WP-000 |
| Children | none |
| Worker | GPT-6; resumed by Codex on 2026-10-12 |
| Verifier | — |
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

| # | Claim | Basis |
|---|---|---|

## Evidence

| ID | What | Where |
|---|---|---|

## Known, unknown, unproven

- **Known:** separate configured listeners, trackers and hubs are implemented;
  migration and destination-port isolation have simulator/socket regressions.
- **Unknown:** real-game and deployed behaviour; full acceptance remains subject
  to review rather than inferred from the passing suite.

## Unresolved

Independent review remains pending. Simulator checks do not prove real FH6
behaviour, authentication of UDP senders, or deployment readiness.

## Checkpoint

Baseline is on main at `ad4551b`. The two-driver implementation is at
`57ff717` on `feat/gpt6-two-driver-backend` ([PR #6](https://github.com/adrianhensler/splittime/pull/6)).
It is included in `feat/codex-integrated-poc` at `3ed8f6c`
([draft PR #10](https://github.com/adrianhensler/splittime/pull/10)), not merged or deployed.
Live claims and limitations are in those PRs. Re-run
`python -m pytest -q tests/test_multi_driver.py tests/test_rivalry.py --basetemp=<new-scratch-directory>`.
On resumption, fetch, inspect the PRs and check the actual refs before editing.

## Verification

Recovery session ran the combined suite (205 passed) and the driver/rivalry
subset (21 passed). These are this session's checks, not owner acceptance or
proof that every acceptance criterion is met. See PR #10 for environment and scope.

## Acceptance

—
