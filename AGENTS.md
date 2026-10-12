# AGENTS.md — SplitTime

Private two-driver Forza Horizon 6 telemetry site, built on LapScope. These
rules apply to any coding agent or person. Nothing here depends on a particular
tool.

## Current phase

**Planning is done; coding has not started.** Do not write code until the
owner starts a packet. The next one is
[work/WP-001-import-baseline.md](work/WP-001-import-baseline.md).

## How work is done

Work is organised as Workpackets in [`work/`](work/). Read
[docs/WORKPACKETS.md](docs/WORKPACKETS.md) once. In short:

1. Take the packet the owner assigns. Read it, then only the context it lists.
2. Stay within its authority and limits.
3. Record claims with evidence, what is unknown or assumed, and a checkpoint.
4. Set it `complete` and stop. You never verify or accept your own packet.

## Read first

1. Your packet.
2. [docs/DESIGN.md](docs/DESIGN.md) — what is being built.
3. [docs/UPSTREAM.md](docs/UPSTREAM.md) — what comes from LapScope and
   Forza-6-telemetry.
4. [docs/ADR.md](docs/ADR.md) — why things are the way they are.
5. After WP-001: upstream's `ARCHITECTURE.md` and
   `docs/wiki/Event-Detection.md` before touching `app/recorder/laps.py`.

## Rules

- **One packet at a time.** Do not build deferred items.
- **Never use sudo or act as root.** If something needs root (packages,
  firewall, services, the web gateway), write the exact commands into
  [docs/SETUP.md](docs/SETUP.md) or the hosting doc, tell the owner, and
  continue with work that does not depend on it.
- **Do not edit anything outside this repository**, including any web server
  or gateway configuration on the host.
- **Upstream code:** keep edits to imported files small and put new features
  in new files. Keep copyright headers. Never weaken or delete an upstream
  scenario test to make a change pass; those tests encode real captures.
- **Detection thresholds** in `laps.py` were tuned on real data. Change one
  only with a real capture that shows the problem, and add a test for it.
- **Never bind the HTTP server beyond loopback** outside a container or test.
- **Never use UDP ports 5200–5300.** For local testing use HTTP 8100 and UDP
  19999 and 20000.
- **Lap times come from the game's lap fields**, never from packet arrival
  time.
- **Recordings are data, not fixtures.** Do not delete, reprocess or edit
  anything in a live data directory. Copy what you need.
- **The software is not tied to one host.** Site-specific material belongs in
  `docs/hosting/` only.
- Commit after each working step. Do not push unless the owner has said to.

## Keeping the docs current

- Progress, new risks, findings: your packet, and `docs/BUILD_PLAN.md`.
- A decision that changes or adds to the design: a new entry at the end of
  `docs/ADR.md` marked Proposed, and the matching edit in `docs/DESIGN.md`.
- A sync from upstream, or newly adapted code: `docs/UPSTREAM.md`.
- Anything an installer would trip over: `docs/SETUP.md`.

## Commands

Available after WP-001:

```sh
.venv/bin/pytest
.venv/bin/ruff check .
```
