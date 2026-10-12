# AGENTS.md — SplitTime

Private two-driver Forza Horizon 6 telemetry site, built on LapScope. These
rules apply to any coding agent or person. Nothing here depends on a particular
tool.

## Current phase

**Planning is done; coding has not started.** The owner's priority is a nearly
complete, runnable WIP/POC as quickly as practical, not a Workpacket framework.
When implementation is assigned, begin with
[WP-001](work/WP-001-import-baseline.md) and work through the smallest useful
end-to-end slices. Do not deploy or modify the host/gateway without authority.

Read the [independent review and implementer handoff](docs/REVIEW_HANDOFF_2026-10-12.md)
for known discrepancies and POC priorities.

## How work is done

This is **Workpacket-light**: existing Markdown packets are bounded task and
handoff checklists, not a required runtime or serial approval ceremony. Read
[docs/WORKPACKETS.md](docs/WORKPACKETS.md) once. In short:

1. Work within the scope and permissions actually assigned.
2. Build runnable increments, run your own tests, and record what you tested,
   evidence, assumptions, failures, and the next checkpoint.
3. A worker's tests are self-checks, **not independent verification**. Do not
   self-declare work independently verified or accepted by the owner.
4. Continue through the next *authorized* POC slice without waiting for a
   ritual verification/acceptance stop after each Markdown packet. Preserve
   unresolved dependencies; independent review is for meaningful checkpoints.

## Read first

1. Your packet.
2. [docs/DESIGN.md](docs/DESIGN.md) — what is being built.
3. [docs/UPSTREAM.md](docs/UPSTREAM.md) — what comes from LapScope and
   Forza-6-telemetry.
4. [docs/ADR.md](docs/ADR.md) — why things are the way they are.
5. Upstream's own documents, now under `docs/upstream/`: `ARCHITECTURE.md`
   and `wiki/Event-Detection.md` before touching `app/recorder/laps.py`.

## Rules

- **POC first.** Keep changes bounded but prioritize an end-to-end working
  experience over completing all workpacket paperwork. Do not build deferred
  features or expand Workpacket itself.
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
- **Time provenance matters.** Prefer in-game lap clocks; some point-to-point
  or cutoff finishes are inferred/extrapolated by upstream. Preserve that
  distinction and never treat network arrival time as an official lap time.
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

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt -r requirements-dev.txt
.venv/bin/ruff check .
.venv/bin/python app/telemetry/packet.py
.venv/bin/pytest -q
```

Run the app and the simulator on test ports:

```sh
DATA_DIR=/tmp/splittime-test TELEMETRY_UDP_PORT=19999 LS_OFFLINE=1 \
  .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8100
.venv/bin/python tools/simulator.py --port 19999 --duration 100
```
