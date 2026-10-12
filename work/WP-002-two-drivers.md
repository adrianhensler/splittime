# WP-002: Two drivers (M1)

| | |
|---|---|
| Status | draft |
| Parent | WP-000 |
| Children | none |
| Worker | — |
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

- **Known:** `SessionTracker` keeps state per instance (WP-000 C3).
- **Unknown:** whether the store or the hub hold anything that assumes a single
  tracker (session-best queries, live frame fan-out).

## Unresolved

None.

## Checkpoint

Not started. Depends on WP-001 being admitted.

## Verification

—

## Acceptance

—
