# WP-001: Import baseline (M0)

| | |
|---|---|
| Status | complete; reviewed and merged (PR #4, `ad4551b`); not admitted by the owner |
| Parent | WP-000 |
| Children | none |
| Worker | Opus 5.5 (Claude Code), 2026-10-12 |
| Verifier | GPT-6, via pull request review |
| Acceptor | owner |

Branch `feat/opus-lapscope-baseline`, issue #1.

## Intent

Get LapScope into this repository unchanged, with its tests passing, so every
later change is a visible diff against a known starting point.

## Outcome

The repo contains LapScope at the pinned commit, licence notices, and a trimmed
tree that tests clean on Linux.

## Authority and limits

- May: copy upstream files, add notices, delete the desktop and exe parts,
  create a virtualenv, run tests and the simulator on local ports.
- May not: change detection logic, schema or API; use sudo; bind HTTP beyond
  loopback; use UDP 5200–5300; touch `prototype/` or
  `docs/PARALLEL_BUILD.md`.

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

- `docs/UPSTREAM.md` (import record, licence duties)
- `docs/PARALLEL_BUILD.md`, `docs/REVIEW_HANDOFF_2026-10-12.md`
- Upstream documents under `docs/upstream/`

## Claims

| # | Claim | Basis |
|---|---|---|
| C1 | Commit `04260ad` holds 111 upstream files byte-identical to `c39a8d9` | E1 |
| C2 | The unmodified import passes upstream's checks: 209 tests | E2 |
| C3 | After cleanup: ruff clean, packet self-test OK, 153 tests pass | E3 |
| C4 | The 56 tests no longer run (209 − 153) all belong to the five `tests/test_desktop_*.py` files, which test the removed desktop launcher | E4, and the two counts in E2 and E3 |
| C5 | No file under `app/` or `tools/`, and no remaining test, was changed | E4 |
| C11 | Notices also cover the vendored uPlot (MIT) and Rajdhani (OFL 1.1) assets | E6 |
| C12 | The compose file publishes HTTP on loopback only | `docker-compose.yml`; not run |
| C6 | A live instance on test ports recorded a simulator run as one session with two timed laps and one open lap | E5 |
| C7 | A wrong-size packet is counted and not parsed | E5 |
| C8 | Both upstream licence texts are in `THIRD_PARTY_NOTICES.md` | E6 |
| C9 | CI passes on the pull request | E7 |
| C10 | The Docker image builds and runs | `asserted` — not tried |

## Evidence

All run on Ubuntu, Linux 6.8, Python 3.12.3, fastapi 0.143.0, uvicorn 0.54.0,
pytest 9.1.1, ruff 0.17.0 (unpinned in `requirements*.txt`; these are what pip
resolved on 2026-10-12).

| ID | What | How to re-run |
|---|---|---|
| E1 | Blob-id comparison: "checked 111, skipped 2 (LFS .gif), differing 0" | `git clone https://github.com/darcane/LapScope /tmp/ls && scripts/verify_upstream_import.py /tmp/ls c39a8d96bbfc6c1e36c43952c71042f4eaeceffc 04260ad` |
| E2 | "209 passed in 62.91s" at `04260ad` | `git checkout 04260ad && .venv/bin/pytest -q` |
| E3 | "All checks passed!", "OK: 324-byte packet, 88 values, round-trip verified", "153 passed in 53.48s" at `ed162df` | the three commands in `AGENTS.md` |
| E4 | Diff of upstream code since import is five deleted test files, nothing else | `git diff --stat 04260ad HEAD -- app tools tests` |
| E5 | Session 1: 6001 frames, laps 42.817 s and 42.533 s, third lap with no time; `bad_packets` went 0 → 1 after a 100-byte datagram | the two run commands in `AGENTS.md`, wait 15 s, then `curl -s localhost:8100/api/sessions` and `/api/sessions/1/laps`; `head -c 100 /dev/zero \| nc -u -w1 127.0.0.1 19999` and `/api/status` |
| E6 | The file | `THIRD_PARTY_NOTICES.md` |
| E7 | CI run on the pull request | the PR's checks tab |

## Known, unknown, unproven

- **Known:** C1 to C8, as self-checks by the worker.
- **Unknown:**
  - Why `/api/status` reported 6181 packets when the simulator reported sending
    6001 and the session stored 6001. Probably trailing race-off packets; not
    investigated.
  - Behaviour on any Python other than 3.12.3, or with other dependency
    versions. Requirements are unpinned lower bounds.
  - Whether the Docker image builds (C10).
- **Unproven (assumed):** that the simulator represents the real game. It is
  upstream's synthetic circuit; nothing here involved Forza.

## Unresolved

Observations for whoever works on WP-002 and WP-003. None was changed here.

1. `app/main.py` binds UDP to `0.0.0.0` with no setting for the address, and
   takes exactly one port from `TELEMETRY_UDP_PORT`.
2. The open third lap is stored with `lap_time` null and is not flagged. This
   bears on the review handoff's point about unfinished attempts.
3. Relative links inside `docs/upstream/` are broken by the move, so a link
   check over all markdown now reports them.
4. `fastapi`, `uvicorn`, `pytest` and `ruff` are unpinned. A lock file would
   make the "fresh Linux setup is reproducible" check stronger.
5. The corner-analysis data contract is still to be written and agreed before
   WP-005 code starts.

## Review round 1 (PR #4, 2026-10-12)

GPT-6 independently confirmed the blob comparison (111 of 111), that retained
`app/`, `tools/` and non-desktop tests are identical to upstream, and the CI
run. It did not run the simulator or Docker. An automated Codex review added
three findings. Responses:

| Finding | Response |
|---|---|
| Compose publishes HTTP on all interfaces | Fixed: `127.0.0.1:8000:8000`. Not run. |
| Notices missing for uPlot and Rajdhani | Fixed: both licence texts added. |
| WebSocket handshake does not check `Host` against the allow-list | Not changed here: it is upstream application code and this packet may not change the API. Recorded in `docs/UPSTREAM.md` for WP-002/WP-003. |
| README and AGENTS said coding had not started | Fixed. |
| Broken relative links in `docs/upstream/` | Left as disclosed. |

## Checkpoint

Done and pushed. Next action for the reviewer: run E1 to E5 independently and
add at least one test of your own. Next action for Opus after merge: branch
`feat/opus-corner-analysis`, starting with a written data contract for review.

## Verification

Reviewed on PR #4 by GPT-6 and by an automated Codex review, 2026-10-12.

- **Independently confirmed by GPT-6:** the blob comparison (111 of 111 files
  identical at `04260ad`); that retained `app/`, `tools/` and non-desktop tests
  are identical to upstream at the PR head; the CI run (ruff, packet
  round-trip, 153 tests).
- **Not independently checked:** the simulator run (C6, C7), Docker (C10, C12),
  anything on another Python, anything with the real game. These remain the
  author's self-evidence or untried.
- Review findings and responses: "Review round 1" above.

Merged to `main` by the integrator as `ad4551b`.

## Acceptance

Pending.
