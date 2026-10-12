# WP-000: Planning and build documents

| | |
|---|---|
| Status | complete |
| Parent | none |
| Children | WP-001 to WP-006 |
| Worker | Claude Code (Opus 5.5), sessions of 2026-10-12 |
| Verifier | none yet |
| Acceptor | owner |

## Intent

Turn the concept PDF into build documents that any agent or person can work
from, on top of existing MIT-licensed code, before any code is written.

## Outcome

A private repository holding the design, decisions, reuse map, build plan,
setup and hosting guides, data-flow explainer and one packet per milestone.

## Authority and limits

Create and push the private repo; write and revise documents; read the upstream
projects, the gateway and the workpacket repo. No code. No changes outside this
repository.

## Acceptance criteria

1. The repo exists, is private, and holds the documents listed in `README.md`.
2. The PDF is archived and replaced by `docs/DESIGN.md`.
3. Decisions are recorded with who made them.
4. Dropped and deferred items are tracked.
5. Setup, game and data-flow notes exist; site-specific hosting is separate.
6. Each milestone has a packet with acceptance criteria.
7. No code has been written.

## Context

- `docs/archive/splittime_forza_technical_concept_v02.pdf`
- darcane/LapScope at `c39a8d9`; ClickClickMedia/Forza-6-telemetry at `523e8ba`
- `/opt/prod/test.hensler.work` as of 2026-10-12
- adrianhensler/workpacket `main` as of 2026-10-12

## Claims

| # | Claim | Basis |
|---|---|---|
| C1 | The repo is private and pushed | E1 |
| C2 | Both upstream projects are MIT-licensed | E2 |
| C3 | LapScope's tracker holds state per instance, so one per driver is feasible | E3 |
| C4 | LapScope discards sessions with no completed lap, after writing their frames | E3 |
| C5 | LapScope's pages use absolute `/api` and `/ws` URLs | E3 |
| C6 | The gateway is reached only by Cloudflare Tunnel and gates services with `forward_auth` | E4 |
| C7 | The FH6 packet is 324 bytes, sent per frame, only while driving, with `IsRaceOn` set in free roam | E5 |
| C8 | Every relative link in the docs resolves | E6 |
| C9 | The setup, hosting and compose instructions are correct | `asserted` |
| C10 | The in-game setting names in `GAME_SETUP.md` are exact | `asserted` |

## Evidence

| ID | What | Where |
|---|---|---|
| E1 | Repo visibility | `gh repo view adrianhensler/splittime --json visibility` |
| E2 | Licence files | `LICENSE` in each upstream repo at the pinned commit |
| E3 | Upstream source read | LapScope `app/recorder/laps.py` (class `SessionTracker`, `KEEP_DISCARDED`), `app/main.py`, `app/static/js/common.js` at `c39a8d9` |
| E4 | Gateway files read | `README.md`, `Caddyfile`, `docker-compose.yml`, `ADDING_SERVICES.md` in `/opt/prod/test.hensler.work` |
| E5 | Second-hand | LapScope `docs/wiki/FH6-Data-Out-Packet.md` and `Event-Detection.md`, which cite the official documentation and real captures. The official page returned HTTP 403 and was not read directly. |
| E6 | Link check | The script in this packet's Verification section |

## Known, unknown, unproven

- **Known:** C1 to C6, C8.
- **Unknown:** how upstream detection behaves over the internet; how much
  free-roam churn matters; each driver's real packet rate; whether the source
  address survives Docker's port publishing.
- **Unproven (assumed):** C7 rests on another project's notes, not our own
  captures. C9 and C10 have never been run. Ranking rules in ADR 10 are a
  worker's defaults.

## Unresolved

- Owner to confirm ADR 10 ranking defaults and the licence for SplitTime.
- Owner to decide whether an agent may push.

## Checkpoint

Planning is finished. Next action: the owner reviews, then starts WP-001.

## Verification

None by an independent party. The worker ran a mechanical link check only:

```sh
python3 - <<'EOF'
import re, pathlib, sys
bad = 0
for f in pathlib.Path('.').rglob('*.md'):
    if '.git' in f.parts: continue
    for m in re.finditer(r'\]\(([^)#\s]+)(#[^)]*)?\)', f.read_text()):
        t = m.group(1)
        if '://' in t or t.startswith('mailto:'): continue
        if not (f.parent / t).exists():
            print(f, '->', t); bad += 1
sys.exit(bad)
EOF
```

## Acceptance

Pending.
