# AGENTS.md — SplitTime

Private two-driver Forza Horizon 6 telemetry site, built on LapScope.

## Current phase

**Planning is done; coding has not started.** Do not write code until the
owner says to start a milestone. The next one is M0 in
[docs/BUILD_PLAN.md](docs/BUILD_PLAN.md).

## Read first

1. [docs/DESIGN.md](docs/DESIGN.md) — what to build.
2. [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) — the milestone you are on and its
   exit checks.
3. [docs/UPSTREAM.md](docs/UPSTREAM.md) — what comes from LapScope and
   Forza-6-telemetry.
4. [docs/ADR.md](docs/ADR.md) — why things are the way they are.
5. After M0: upstream's own `ARCHITECTURE.md` and
   `docs/wiki/Event-Detection.md` before touching `app/recorder/laps.py`.

## Rules

- **One milestone at a time.** Finish its exit checks before starting the
  next. Do not build deferred items.
- **You run as a low-privileged user. Never use sudo.** If something needs
  root (packages, firewall, services, web server), write the exact commands
  into [docs/SETUP.md](docs/SETUP.md), tell the owner, and continue with work
  that does not depend on it.
- **Upstream code:** keep edits to imported files small and put new features
  in new files. Keep copyright headers. Never weaken or delete an upstream
  scenario test to make a change pass; those tests encode real captures.
- **Detection thresholds** in `laps.py` were tuned on real data. Change one
  only with a real capture that shows the problem, and add a test for it.
- **Never bind the HTTP server to anything but loopback** outside a test.
- **Never use UDP ports 5200–5300.** For local testing use HTTP 8100 and UDP
  19999 and 20000.
- **Lap times come from the game's lap fields**, never from packet arrival
  time.
- **Recordings are data, not test fixtures.** Do not delete, reprocess or edit
  anything under a live data directory. Copy what you need.
- Commit after each working step. Do not push unless the owner has said to.

## Keeping the docs current

- Milestone progress, new risks, answers to open questions:
  `docs/BUILD_PLAN.md`.
- A decision that changes or adds to the design: a new entry at the end of
  `docs/ADR.md`, and the matching edit in `docs/DESIGN.md`.
- A sync from upstream: the new commit in `docs/UPSTREAM.md`.
- Anything a new installer would trip over: `docs/SETUP.md`.

## Commands

Available after M0:

```sh
.venv/bin/pytest
.venv/bin/ruff check .
```
