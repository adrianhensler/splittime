# WP-007: Always-on collector, separate from the web app

| | |
|---|---|
| Status | in-progress; application change in draft PR, not merged, not deployed |
| Parent | WP-003 |
| Children | none |
| Worker | Claude Opus 5.5 (checkpoint owner) |
| Verifier | — |
| Acceptor | owner |

## Intent

Every rebuild for a page or analysis change restarts the recorder, because one
process does both. The owner asked for the collector to be split out so that
it stays up while the site is worked on.

## Outcome

The same build can run as a collector (UDP, detection, recording, live state)
and as a web process (pages, API) on one database, and restarting the web
process does not interrupt a recording. Single-process operation is unchanged
and remains the default.

## Authority and limits

- May: add the role switch, the web half's guards, database-held session id
  allocation, tests and documents.
- May not: deploy, touch the runtime checkout, the live data directory or the
  gateway. Cutover needs the owner's explicit go-ahead and is described in the
  gateway repository, not here.
- May not: change detection thresholds or anything in `app/recorder/laps.py`.

## Acceptance criteria

1. With no `SPLITTIME_ROLE` set, behaviour and the existing test suite are unchanged.
2. A web process binds no UDP port and leaves an open session open at start.
3. A collector process answers only `GET /api/status` and `/ws/live`.
4. Two processes on one database never allocate the same session id, and a
   deleted id is not reused after a restart.
5. In the web role, reprocess, import, compact and delete are refused with 409
   while the collector reports a recording, and with 503 when the collector
   does not answer.
6. Restarting the web process during a simulated drive leaves the collector's
   session, packet count and write state undisturbed.
7. Checked on the real deployment after cutover (not part of this pull request).

## Context

- `docs/ADR.md` entry 24; `docs/SETUP.md` "collector and web as two processes"
- `app/roles.py`, `app/main.py` (`create_app`, `lifespan`), `app/api/routes.py`
  (status and the two `_session_active` guards), `app/recorder/store.py`
  (`session_seq`, `create_session`, connection timeout)

## Claims

See PR #22.

## Evidence

See PR #22.

## Known, unknown, unproven

- **Known:** criteria 1 to 6 hold in the worker's own tests and a two-process
  simulator run on loopback against a copy of the deployed recordings.
- **Unknown:** behaviour with two real drivers and internet delivery; how long
  a real reprocess holds the write lock on the deployed database.
- **Unproven (assumed):** SQLite WAL shared by two containers through one bind
  mount on the same host behaves as two local processes do.

## Unresolved

- Session start delayed by a web-side reprocess or import in progress (ADR 24
  limits; BUILD_PLAN R9). Owner to decide whether the residual is acceptable.
- Detection remains in the collector. Moving it out is a separate decision.

## Checkpoint

Checkpoint owner: Claude Opus 5.5. Repository `adrianhensler/splittime`, branch
`feat/collector-split`, draft [PR #22](https://github.com/adrianhensler/splittime/pull/22). Pushed; not merged;
not deployed. Last check: worker's own lint, full pytest and a two-process
simulator run, 2026-10-12. Unresolved criteria: 7. Next action: independent
review of the draft pull request; then the owner decides on cutover using the
gateway repository's runbook.

## Verification

None. The worker's tests are self-checks.

## Acceptance

Pending.
