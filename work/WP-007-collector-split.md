# WP-007: Always-on collector, separate from the web app

| | |
|---|---|
| Status | in-progress; application change in PR #22 awaiting review, not merged, not deployed |
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

Snapshot at `0792990` for [PR #22](https://github.com/adrianhensler/splittime/pull/22).
All evidence is the worker's own; none is independent.

| # | Claim | Basis |
|---|---|---|
| C1 | With no role set, behaviour and the existing suite are unchanged (criterion 1) | E1 |
| C2 | A web process binds no UDP port and leaves an open session open at start; a recording role cleans it up (criterion 2) | E2 |
| C3 | A collector answers only `GET /api/status` and `/ws/live`: no pages, no docs, no method that changes data (criterion 3) | E2, E3 |
| C4 | Two stores on one file never share a session id, and a deleted top id is not reused after a restart (criterion 4) | E2 |
| C5 | In the web role, heavy writes get 409 while the collector reports a recording and 503 when it does not answer (criterion 5) | E2, E3 |
| C6 | Restarting the web process mid-lap leaves the collector's session, packet count and write state undisturbed (criterion 6) | E3 |
| C7 | The collector's flush fails fast behind a web-side write and succeeds on retry | E2 |
| C8 | Criterion 7, the real deployment, is not met: nothing is deployed | `asserted` |

## Evidence

| ID | What | Where (commit, command, path) |
|---|---|---|
| E1 | Lint, packet self-check and full suite: 299 passed, of which 279 predate this work | `ruff check .`; `python app/telemetry/packet.py`; `pytest -q` at `0792990`; CI run on PR #22 |
| E2 | Role, startup, HTTP surface, session id, guard and lock-wait regressions | `pytest -q tests/test_roles.py` (20 cases) |
| E3 | Two processes on loopback (HTTP 8100/8101, UDP 19999/20000) against a copy of the deployed recordings, driven by `tools/simulator.py`: collector 404 for `/api/sessions`, pages and `DELETE`; 409 for reprocess, compact and delete of the live session; web restarted mid-lap with the collector keeping session 15, packets 499 to 755, no write error, none dropped; after the session closed, reprocess, rename and compact from web succeeded; with the collector stopped, pages 200 and status, reprocess, compact 503; `PRAGMA integrity_check` ok | Run once by the worker, 2026-10-12; results in the PR #22 description. Not scripted in the repository |

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
`feat/collector-split`, [PR #22](https://github.com/adrianhensler/splittime/pull/22), ready for review. Pushed; not merged;
not deployed. Last check: worker's own lint, full pytest and a two-process
simulator run, 2026-10-12. Unresolved criteria: 7. Next action: independent
review of the draft pull request; then the owner decides on cutover using the
gateway repository's runbook.

## Verification

None. The worker's tests are self-checks.

## Acceptance

Pending. Not accepted by the owner; a reviewed merge would count under ADR 20
for criteria 1 to 6 only. Criterion 7 stays open until after cutover.
