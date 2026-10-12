# SplitTime design

Supersedes the concept PDF in `docs/archive/`. Decisions and their reasons are
in [ADR.md](ADR.md); this file states what is to be built.

## 1. Purpose

Two friends drive FH6 at different times. Each configures Data Out once. Events
are captured without any in-game action, and afterwards either driver opens a
private site to see records, rivalry history, overlaid telemetry and
corner-by-corner differences.

## 2. Scope

**In (v1)**

- One UDP port per driver on the server; the port identifies the driver.
- Automatic recording of events only: circuit races, Rivals, sprints and other
  point-to-point runs, World Time Attack.
- Lossless raw packets kept for every recorded event, so detection fixes can be
  replayed onto old recordings.
- Route identification by geometry fingerprint; unknown routes stay unnamed
  until a driver names them.
- Per-driver bests, cross-driver records per route and class, rivalry history.
- Overlay of any two (or more) laps aligned by track position.
- Corner-by-corner comparison of two laps on the same route.
- Manual correction of lap flags by either driver.

**Out (v1)** — tracked in [BUILD_PLAN.md](BUILD_PLAN.md#deferred)

- Free-roam recording or storage.
- CSV import.
- Live dashboard, tuning advice, AI coaching, MCP server, desktop/exe builds.
- In-app accounts, TLS, certificates (the web server in front handles access).
- VPN or home-side collector for authenticated transport.

## 3. Architecture

```
Driver A  FH6 Data Out ──UDP :9999──┐
                                    ├─▶ listener per port ─▶ SessionTracker per driver ─┐
Driver B  FH6 Data Out ──UDP :10000─┘        (size check, parse)                        │
                                                                                        ▼
        browser ─HTTPS─▶ existing web server ─HTTP 127.0.0.1:8000─▶ FastAPI ◀──▶ SQLite (WAL)
                         (TLS + access control)                     API + static pages
```

- One Python process (FastAPI, uvicorn, asyncio), one SQLite database. It runs
  as a container or a plain process and needs nothing privileged.
- UDP ports are above 1024 and outside 5200–5300 (the game binds its own
  socket there).
- HTTP is reachable only by the web server in front, which terminates TLS and
  restricts access. The app's API has no authentication of its own and exposes
  delete, edit and reprocess endpoints, so it must never be reachable directly.
- The app can be served under a URL prefix such as `/splittime/`, set by
  configuration, with no prefix as the default.
- Nothing in the software refers to a particular host or site. What travels
  where is set out in [DATA_FLOW.md](DATA_FLOW.md).
- The base is LapScope, which already provides parsing, session tracking, lap
  and finish detection, route fingerprinting, storage, reprocess, manual edits
  and multi-lap overlay for a single driver. SplitTime adds the driver
  dimension, rivalry views and corner comparison. See [UPSTREAM.md](UPSTREAM.md).

## 4. The packet (verified facts)

Source: LapScope's packet notes, which cite the official FH6 Data Out
documentation and real captures.

- Fixed 324-byte little-endian packet, one per rendered frame. Rate equals the
  game's frame rate: 60/s on console, and reports of 128–140/s on PC.
- Sent only while driving. Nothing in menus, pause or photo mode.
- `IsRaceOn` is 1 in free roam too. It does not mean "in an event".
- No route name, game mode, event boundary, lap-invalid flag, tune or assists.
- Lap fields: `BestLap`, `LastLap`, `CurrentLap`, `CurrentRaceTime`,
  `LapNumber`, `RacePosition`. `LapNumber` does not increment on the final lap.
- `DistanceTraveled` is a per-route track-position parameter, not metres. It is
  the alignment axis for comparing laps.
- Car identity: `CarOrdinal`, `CarClass` (D, C, B, A, S1, S2, R, X),
  `CarPerformanceIndex`, `DrivetrainType`.
- A title update can change the packet. Wrong-size packets are counted and
  logged, never parsed.

Storage: 324 bytes × rate. About 70 MB per driving hour at 60/s, about 160 MB at
140/s. Both drivers are on PC, so plan on the higher figure. Only event
sessions are kept.

## 5. Data model

Upstream tables (`sessions`, `frames`, `laps`, `routes`, `edits`,
`session_groups`, `car_names`) are kept. Additions:

| Change | Purpose |
|---|---|
| `drivers` (id, name, udp_port) | The two players. Loaded from config at start. |
| `sessions.driver_id` | Attributes every session, and through it every lap, to a driver. |
| `sessions.source_addr` | Last seen source IP:port. Evidence only, never identity. |

Routes are shared between drivers. That is what makes cross-driver comparison
work: both drivers' laps on the same fingerprint land on one route row.

Three independent status dimensions per lap or run, mapped onto upstream flags:

| Dimension | Values | Source |
|---|---|---|
| Completion | complete / incomplete / provisional | finish signals; `cutoff` flag means provisional |
| Validity | accepted / suspect / excluded | rewind and contact flags, manual edits |
| Capture quality | continuous / gapped | gaps in `TimestampMS` within the lap (new) |

## 6. Behaviour rules

Detection rules are upstream's and are documented in its
`docs/wiki/Event-Detection.md`. The outcomes SplitTime depends on:

| Case | Record | Show / score |
|---|---|---|
| Race quit after 2 of 3 laps | Keep the 2 completed laps | Completed laps can rank; no race result |
| Quit before any full lap | Session discarded | Nothing |
| Rivals session ends | Keep every completed lap | Not a DNF |
| Stream cuts at the finish | Lap completed from clock and distance, flagged `cutoff` | Provisional; not ranked by default |
| Network loss or crash | Keep what arrived; mark the lap gapped | Gapped laps not ranked by default |
| Restart | Split into a new session | No merge |
| Rewind | Flag the lap; trim the rewound stretch | Suspect; not ranked by default |
| Fast travel / teleport | Never a lap finish | Nothing |
| Contact | Flag the lap (inferred, with known misses on light scrapes) | Suspect; not ranked by default |
| Same roads, different route | Separate fingerprint | Separate records |
| Unknown or custom route | Fingerprint kept, unnamed | Name once; applies to all past sessions |
| Free roam | Session discarded at close | Nothing |
| Forged or stray UDP | Wrong size dropped; source change logged | Nothing |

## 7. Comparison

- **Ranked.** Accepted, complete, continuous laps or runs on the same route, in
  the same category. Category is route × car class. The car and PI are shown
  beside every ranked time. The record for a category is the best ranked lap;
  the rivalry score is the count of categories each driver leads.
- **Exploratory.** Any laps on the same route overlaid regardless of class,
  mode or flags. Differences are labelled. No winner is declared.
- **Corner comparison.** A route is divided once into stable corner segments by
  track position. For two laps, each segment reports time delta, brake onset,
  minimum speed, throttle application point and exit speed. Every figure links
  to the underlying traces. Causes are not asserted.

Lap times always come from the game's own lap fields, never from packet arrival
time.

## 8. Security

- UDP has no authentication. Anyone who finds a port can inject packets. For
  two friends this is accepted: wrong-size packets are dropped, the source
  address is recorded per session, and a source change mid-session is logged.
- The listener never replies, so it cannot be used for reflection.
- All web access goes through the existing web server. Edit, delete and
  reprocess are available to anyone who gets past it.
- The app fetches car-name and route-catalogue updates from GitHub about once a
  day. This can be turned off. Upstream's browser-side update check is removed.
- Telemetry is unencrypted and goes to the server's own IP address, which the
  drivers therefore know. A CDN or tunnel in front of the website does not
  hide it.

## 9. Acceptance checks

| # | Check | Milestone |
|---|---|---|
| 1 | Each driver sets Data Out once; unattended captures appear on different days | M2 |
| 2 | A and B stay distinguishable when their public IP is shared or changes | M1 |
| 3 | The same route matches across sessions and drivers; similar roads with a different start or direction do not merge | M3 |
| 4 | An abandoned 3-lap race keeps 2 laps; no third lap or race finish is invented | M1 |
| 5 | Rivals and race laps on a shared route can be viewed together, with rankings separated where rules differ | M3 |
| 6 | One page shows PBs, clean/suspect labels, traces, largest corner differences and capture quality | M5 |
| 7 | An hour of free roam leaves no stored session and no lasting growth in the database | M2 |
