# WP-003: Deploy and real captures (M2)

| | |
|---|---|
| Status | draft |
| Parent | WP-000 |
| Children | none |
| Worker | — |
| Verifier | — |
| Acceptor | owner |

## Intent

Put the two-driver recorder where both drivers' games can reach it, and find
out how the upstream detection behaves on real internet traffic before
building on it.

## Outcome

The app runs behind a reverse proxy under a URL prefix, both drivers record
real events unattended, and the two main risks are measured.

## Authority and limits

- May: make the app work under a configurable URL prefix; remove the browser
  update check; add configuration for bind address and allowed host; write
  deployment files in this repo.
- May not: run anything as root, edit the gateway repo, or open firewall
  ports. Those steps are written up for the owner to run.
- Real recordings are data. Copy them for analysis; never edit or delete them.

## Acceptance criteria

1. With a prefix configured, every page, API call and WebSocket works through a
   proxy that strips the prefix; with none configured, behaviour is unchanged.
2. The browser makes no request to GitHub.
3. `docs/hosting/test-hensler-work.md` and `docs/SETUP.md` match what was
   actually run, including every correction found on the way.
4. Both drivers have recorded events on different days without touching the
   server (acceptance check 1).
5. Between them the drivers have captured: a circuit race, a Rivals session, a
   sprint, a race quit mid-way, a rewind, and 30 minutes of free roam.
6. A written finding on R1 (timing over the internet) in `docs/BUILD_PLAN.md`,
   with the captures it rests on.
7. A written finding on R2 (free-roam churn): database size before and after,
   and no stored session (acceptance check 7).
8. Each driver's observed packet rate is recorded (R3).

## Context

- `docs/hosting/test-hensler-work.md`, `docs/SETUP.md`, `docs/GAME_SETUP.md`
- `docs/ADR.md` entries 5, 6, 15, 16, 17
- `docs/BUILD_PLAN.md` risks R1 to R3, R7

## Claims

| # | Claim | Basis |
|---|---|---|

## Evidence

| ID | What | Where |
|---|---|---|

## Known, unknown, unproven

- **Known:** upstream pages use absolute URLs (WP-000 C5).
- **Unknown:** everything in the "Things to confirm" table of the hosting doc.

## Unresolved

- The owner runs the root and gateway steps.
- Both drivers need to be available to drive the capture list.

## Checkpoint

Not started. Depends on WP-002 being admitted.

## Verification

—

## Acceptance

—
