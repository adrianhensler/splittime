# SplitTime design

Supersedes the concept PDF in `docs/archive/`. Decisions and their reasons are
in [ADR.md](ADR.md); this file states what is to be built.

## 1. Purpose

Two friends drive FH6 at different times. Each configures Data Out once. Events
are captured without any in-game action, and afterwards either driver opens a
site to see records, rivalry history, overlaid telemetry and corner-by-corner
differences. Viewing is public in the reference deployment; management
requires the gateway's login and service grant (ADR 23).

## 2. Scope

**In (v1)**

- One UDP port per driver on the server; the port identifies the driver.
- Automatic recording of events only: circuit races, Rivals, sprints and other
  point-to-point runs, World Time Attack.
- Lossless raw packets kept for completed timed events, so detection fixes
  can be replayed onto old recordings; recognized abandoned events with no
  completed lap retain an **incomplete-attempt summary** (not an invented time
  or necessarily a permanent raw recording).
- Route identification by geometry fingerprint; unknown routes stay unnamed
  until a driver names them.
- Per-driver bests, cross-driver records per route and class, rivalry history.
- Overlay of any two (or more) laps aligned by track position.
- Corner-by-corner comparison of two laps on the same route.
- Manual correction of lap flags by either driver.

**Out (v1)** — tracked in [BUILD_PLAN.md](BUILD_PLAN.md#deferred)

- Free-roam recording or storage.
- CSV import.
- Tuning advice, AI coaching, MCP server, desktop/exe builds.
- Anything live beyond watching. Upstream's Live page is kept as an optional
  view of both drivers (ADR 22); it is not part of v1's acceptance, and live
  standings or a live comparison are not planned.
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
  restricts management access. The app's API has no authentication of its own and exposes
  delete, edit and reprocess endpoints, so it must never be reachable directly.
- The app can be served at the root or under a URL prefix such as
  `/splittime/`. Pages use relative URLs; no application prefix setting is
  needed. The proxy strips the prefix for HTTP and WebSocket requests and
  redirects the bare prefix `/splittime` to `/splittime/`.
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
work: both drivers' laps on the same fingerprint may land on one route row.
**Fingerprint equality is a candidate route match, not proof of identical
checkpoint order, direction, game mode, or timing rules.** Such uncertainty
must not silently create ranked equivalence.

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
| Quit before any full lap of a recognized event | Keep minimal incomplete-attempt summary; raw frames may be discarded | Visible as incomplete, never ranked |
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

- **Ranked (proposed, ADR 10).** Accepted, complete, continuous laps or runs
  on a route with adequately matched conditions and timing rules. The initial
  category `route × car class` is a reversible default, **not confirmed
  competitive equivalence**. Show car, PI, inferred game mode and any
  comparability warnings; do not award a ranked winner when route or timing
  equivalence is unresolved. The provisional rivalry score counts categories
  led by each driver.
- **Exploratory.** Any laps on the same route overlaid regardless of class,
  mode or flags. Differences are labelled. No winner is declared.
- **Corner comparison.** A route is divided once into stable corner segments by
  track position. For two laps, each segment reports time delta, brake onset,
  minimum speed, throttle application point and exit speed. Every figure links
  to the underlying traces. Causes are not asserted.

Use game-provided lap timing whenever available. Some upstream geometric or
cutoff finishes are inferred or extrapolated; preserve a timing-source marker.
Manual validity/flag corrections cannot erase the detector's cutoff evidence
or promote its estimated time to a clean candidate record.
Internet packet arrival timestamps must not be treated as official lap times.
Circuit/sprint classification does not by itself identify Rivals versus a
conventional race; unknown event modes remain unknown until validated.

## 8. Security

- UDP has no authentication. Anyone who finds a port can inject packets. For
  two friends this is an accepted transport choice: wrong-size packets are
  dropped, source address is evidence only, and a source change is logged.
  **Packet size and per-driver destination ports do not authenticate a sender.**
  Apply bounded receive rates/queues and sensible storage limits.
- The listener never replies, so it cannot be used for reflection.
- All web access goes through the existing web server. In the reference
  deployment, GET/HEAD and WebSocket reads are public, including CSV exports
  and packet-field telemetry. Non-GET/HEAD requests require the expected
  Origin, gateway login and service grant. A public page link grants no
  management access. Verify externally that
  management routes cannot be reached around the gateway before deployment.
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
