# Build plan

Update the status table and the lists below as work proceeds. Each milestone
ends with its exit checks passing and a commit.

## Status

| Milestone | State | Notes |
|---|---|---|
| Planning docs | Done 2026-10-12 | Open questions below still need the owner |
| M0 Import baseline | Not started | |
| M1 Two drivers | Not started | |
| M2 Deploy and real captures | Not started | Needs root steps from SETUP.md |
| M3 Rivalry views | Not started | |
| M4 Corner comparison | Not started | |
| M5 Summary page and polish | Not started | |

## Milestones

### M0 Import baseline

- Import LapScope at `c39a8d9` as one unmodified commit.
- Add `THIRD_PARTY_NOTICES.md`.
- Remove `desktop/`, exe spec, release workflow and Docker files in a second
  commit. Fix or remove the tests that covered them.
- **Exit:** `pytest` and `ruff check` pass on Linux. The simulator, pointed at
  the running app, produces a session with laps.

### M1 Two drivers

- Driver config (name and port per driver). One listener and one
  `SessionTracker` per driver.
- Schema migration: `drivers`, `sessions.driver_id`, `sessions.source_addr`.
- Per-driver bests and live state; nothing shared between trackers except the
  store and routes.
- Log a source address change within a session.
- **Exit:** two simulators on two ports at once produce correctly attributed
  sessions, including with the same source IP. The upstream scenario tests
  still pass. Acceptance checks 2 and 4.

### M2 Deploy and real captures

- HTTP bound to loopback; configurable allowed host for the proxy's name.
- Service unit, proxy site and firewall per [SETUP.md](SETUP.md).
- Both drivers point the game at the server and drive one of each: circuit
  race, Rivals, sprint, a quit mid-race, a rewind, and 30 minutes of free roam.
- Review those captures for R1 and R2 below before going further.
- **Exit:** acceptance checks 1 and 7. A written note in this file on what the
  real captures showed.

### M3 Rivalry views

- Driver filter and labels in session list and analysis page.
- Records table per route × class with both drivers' best ranked laps.
- Rivalry history and score.
- Ranked versus exploratory labelling in the overlay.
- Capture-quality flag from `TimestampMS` gaps.
- **Exit:** acceptance checks 3 and 5.

### M4 Corner comparison

- numpy view over a lap's stored frames.
- Corner detection adapted from Forza-6-telemetry; corners fixed per route and
  numbered, stored with the route.
- Two-lap corner table: time delta, brake onset, minimum speed, throttle
  point, exit speed.
- **Exit:** on two real laps of one route, corner deltas sum to the lap delta
  within 0.05 s, and corner numbering is identical for both drivers.

### M5 Summary page and polish

- One page per route: PBs, flags, traces, largest corner differences, capture
  quality.
- Storage usage display.
- **Exit:** acceptance check 6.

## Risks

| # | Risk | Check | When |
|---|---|---|---|
| R1 | Upstream timing logic assumes a LAN. Internet jitter, loss and reordering may upset arrival-time rules (15 s silence, clock-freeze finish, airborne duration). | Compare a session recorded over the internet with the same drive recorded locally, or replay with injected loss | M2 |
| R2 | Free-roam frames are written every second and deleted at session close. Long free roam means heavy write-then-delete churn and a database file that does not shrink without vacuum. | Measure file size before and after 30 minutes of free roam. If it matters, hold frames in memory until event evidence appears. | M2 |
| R3 | PC frame rates above 60 raise storage and write load two to three times. | Note each driver's platform and observed packet rate | M2 |
| R4 | A game update changes the packet. | Wrong-size counter visible on a status page | M1 |
| R5 | Upstream moves on and our copy drifts. | Keep edits to upstream files small; record syncs in UPSTREAM.md | Ongoing |
| R6 | Corner boundaries differ between cars or lines, so numbering is unstable. | Derive corners once per route from a reference lap, not per lap | M4 |

## Deferred

| Item | Why deferred |
|---|---|
| CSV import | No defined format; raw replay covers testing (ADR 8) |
| Free-roam recording | Storage; not wanted (ADR 7) |
| VPN or home collector | Not needed for two friends (ADR 5) |
| In-app accounts | Web server handles access (ADR 6) |
| Shared-segment comparison across different routes | Later idea from the concept |
| Weekly challenges or other rivalry formats | Decide after using the basic records table |
| Retention limits and deletion tools beyond upstream's | Storage is small with events only |
| More than two drivers | Design allows it; untested |

## Open questions

For the owner. Each has a working default so none blocks M0 or M1.

1. **Which web server fronts the app, and how is access restricted?** Default:
   basic auth at the proxy. Needed for M2.
2. **Is the server a public VPS with a static IPv4?** The game's Data Out
   setting takes an IP address. Needed for M2.
3. **Console or PC for each driver?** Affects packet rate and storage (R3).
4. **Ports.** Default 9999 and 10000.
5. **Ranking defaults in ADR 10.** Confirm or change.
6. **Licence for SplitTime itself** if the repo is ever made public. Default:
   MIT, to match upstream.
7. **Does the agent push to GitHub, or only commit locally?** Default: local
   commits only; the owner pushes.
