# WP-001: Import baseline (M0)

| | |
|---|---|
| Status | draft |
| Parent | WP-000 |
| Children | none |
| Worker | — |
| Verifier | — |
| Acceptor | owner |

## Intent

Get LapScope into this repository unchanged, with its tests passing, so every
later change is a visible diff against a known starting point.

## Outcome

The repo contains LapScope at the pinned commit, licence notices, and a trimmed
tree that tests clean on Linux.

## Authority and limits

- May: copy upstream files, add notices, delete the desktop and exe parts,
  create a virtualenv, run tests and the simulator on local ports.
- May not: change detection logic, schema or API; use sudo; push without the
  owner's say; bind HTTP beyond loopback; use UDP 5200–5300.

## Acceptance criteria

1. One commit contains LapScope at `c39a8d9` with no modifications.
2. `THIRD_PARTY_NOTICES.md` holds both upstream licence texts and commits.
3. A second commit removes `desktop/`, the exe spec and the release workflow.
   The Dockerfile and compose file stay.
4. `pytest` passes and `ruff check .` is clean; any test removed is listed with
   the reason.
5. The upstream simulator, pointed at the running app on test ports, produces a
   session with laps.
6. The Python version used is recorded in `docs/SETUP.md`.

## Context

- `docs/UPSTREAM.md` (import method, licence duties)
- `docs/BUILD_PLAN.md` M0
- Upstream `AGENTS.md` and `ARCHITECTURE.md`, once imported

## Claims

| # | Claim | Basis |
|---|---|---|

## Evidence

| ID | What | Where |
|---|---|---|

## Known, unknown, unproven

- **Unknown:** whether upstream tests depend on the removed desktop modules;
  which Python versions upstream supports.

## Unresolved

None.

## Checkpoint

Not started. First action: clone LapScope at `c39a8d9` and copy the tree in.

## Verification

—

## Acceptance

—
