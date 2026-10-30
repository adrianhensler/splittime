# SplitTime

Self-hosted Forza Horizon 6 telemetry for two drivers who play at different
times. Each driver's game streams Data Out UDP to the server. The site records
every event automatically, and both drivers compare laps afterwards, as if
they had raced each other.

[![SplitTime: watch the 80-second tour](docs/media/reel-poster.jpg)](https://test.hensler.work/splittime-reel/)

*[Watch the tour](https://test.hensler.work/splittime-reel/), or
[download it](https://github.com/adrianhensler/splittime/releases/download/reel-2026-10-30/splittime-reel.mp4)
(MP4, 16 MB). Recorded from the two drivers' real data; the Live scene is a
simulated drive.*

| | |
|---|---|
| [![Race replay in follow mode](docs/media/replay.jpg)](docs/media/replay.jpg) | [![The AI race engineer's review](docs/media/race-engineer.jpg)](docs/media/race-engineer.jpg) |
| **Replay**: two recorded laps raced head to head, following one car | **Race report**: the AI race engineer's review, every number checked against the telemetry |
| [![Rivalry](docs/media/rivalry.jpg)](docs/media/rivalry.jpg) | [![Traces and corners](docs/media/traces.jpg)](docs/media/traces.jpg) |
| **Rivalry**: records per route and class, and the latest lead changes | **Traces & corners**: speed, throttle, brake and steering by distance |
| [![Stats](docs/media/stats.jpg)](docs/media/stats.jpg) | [![Weekly recap](docs/media/recap.jpg)](docs/media/recap.jpg) |
| **Stats**: leaderboards, head to head and more | **Weekly recap**: milestones, personal bests and records within reach |

SplitTime is built on [LapScope](https://github.com/darcane/LapScope) by
Erdem Darcan, which supplies the recorder, lap and event detection, storage
and the original analysis page. Its corner detection thresholds are adapted
from [Forza-6-telemetry](https://github.com/ClickClickMedia/Forza-6-telemetry)
by ClickClickMedia. Both are MIT-licensed; see [Credits](#credits).

**Status:** in regular use by its two drivers on one server. It is a hobby
project: comparisons between drivers are exploratory, not official results,
and the in-app How it works page (`app/static/how-it-works.html`) lists what
the recorder can get wrong.

## What it does

- **Live**: a card per driver while they drive (speed, gear, inputs, map),
  from an always-on collector that keeps recording while the website updates.
- **Analysis**: up to six laps overlaid, across sessions and drivers: speed,
  throttle, brake and steering along the lap.
- **Rivalry**: records per route and car class, who holds what, every
  attempt (finished or given up) and the latest lead changes.
- **Race report**: two laps compared section by section and corner by corner
  (corners numbered per route), with an optional AI race engineer's review.
  The AI only writes about measured facts, and every number it states is
  checked against them; a review that fails the check is not shown. A report
  is written by itself when a record changes hands.
- **Then vs now**: a driver's current best against their first clean run on
  the same route.
- **Replay**: recorded laps raced against each other on the map, from above
  or following one car.
- **Stats**: totals, leaderboards, head to head, clean driving, consistency,
  improvement, routes, cars, activity, achievements and next goals.
- **Weekly recap**: each Monday-to-Sunday week's laps, personal bests,
  records that changed hands, the records each driver is closest to taking
  back, and dated milestones (new routes, lap counts, personal-best streaks,
  first time ahead), with an optional fact-checked AI column.
- **Session debrief**: a measured review of a whole session.
- **Refresh offer**: open pages say when new results arrive; nothing reloads
  by itself.
- **How it works** and **What's new** pages in the app itself.

Lap times keep their provenance: a time SplitTime had to take from its own
clock, because the game stopped sending at the finish line, is marked "est."
wherever it appears.

The AI features are optional (an OpenRouter key on the server) and share one
hard budget of $1 per UTC month. Everything else works without them.

## Running it

SplitTime is Python (FastAPI, SQLite), with no build step and no frontend
bundler. [docs/SETUP.md](docs/SETUP.md) covers a server: firewall, the two UDP
ports, a container or plain process, and the gateway in front of it.
SplitTime itself has no login, so writes must sit behind a gateway that has
one. [docs/GAME_SETUP.md](docs/GAME_SETUP.md) is the one page each driver needs.

```sh
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
python -m pytest -q                 # backend
node --test tests/ui/*.test.cjs     # page scripts
```

`tools/simulator.py` sends synthetic packets, so the whole pipeline can be
tried without the game.

## Documents

| Doc | What it is |
|---|---|
| [docs/DESIGN.md](docs/DESIGN.md) | The spec: scope, architecture, data model, behaviour rules, acceptance checks |
| [docs/DATA_FLOW.md](docs/DATA_FLOW.md) | What is sent, by whom, to where, and what is kept |
| [docs/GAME_SETUP.md](docs/GAME_SETUP.md) | One-page setup for each driver |
| [docs/SETUP.md](docs/SETUP.md) | Running a server: accounts, firewall, reverse proxy, pitfalls |
| [docs/hosting/](docs/hosting/) | The owner's own deployment, as a worked example. Not part of the software. |
| [docs/UPSTREAM.md](docs/UPSTREAM.md) | The two MIT projects this builds on, what was taken, and licence duties |
| [docs/ADR.md](docs/ADR.md) | Decision record |
| [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) | Milestones, risks, deferred items, open questions |
| [docs/WORKPACKETS.md](docs/WORKPACKETS.md) | How work is assigned, recorded, verified and accepted |
| [work/](work/) | One Workpacket per milestone, with its evidence |
| [AGENTS.md](AGENTS.md) | Rules for any coding agent or person working here |
| [docs/WORKPACKET_TAKEAWAYS.md](docs/WORKPACKET_TAKEAWAYS.md) | Notes for the separate Workpacket project |
| [docs/REVIEW_HANDOFF_2026-10-12.md](docs/REVIEW_HANDOFF_2026-10-12.md) | Independent design review, corrections and coding-agent handoff |
| [docs/upstream/](docs/upstream/) | LapScope's own documents, unchanged. Read `ARCHITECTURE.md` and `wiki/Event-Detection.md` before touching the recorder. |
| [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) | Licences of the code this includes |
| [docs/archive/](docs/archive/) | Original concept PDF (superseded by DESIGN.md) |

## Credits

- **[LapScope](https://github.com/darcane/LapScope)** by Erdem Darcan (MIT):
  the base of this repository, imported whole at `c39a8d9`: packet parsing,
  the UDP listener, session, lap, finish, rewind and contact detection,
  storage, reprocessing, the route catalogue, car names, the analysis page,
  the simulator and its tests.
- **[Forza-6-telemetry](https://github.com/ClickClickMedia/Forza-6-telemetry)**
  by ClickClickMedia (MIT): the corner detection approach and thresholds
  (lateral g, heading change, and the hairpin, switchback and sweeper rules),
  adapted in `app/corners/detect.py`.

Their licences are reproduced in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md),
and [docs/UPSTREAM.md](docs/UPSTREAM.md) records exactly what was taken.
Forza Horizon is a trademark of Microsoft; SplitTime is not affiliated with
Microsoft or Playground Games.

## Licence

SplitTime's own code is under the [MIT licence](LICENSE). The code it
includes from the projects above stays under their MIT licences and
copyright notices.
