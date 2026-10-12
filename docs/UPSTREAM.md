# Upstream projects

SplitTime reuses two MIT-licensed projects. Both were read on 2026-10-12 at the
commits below.

| Project | Licence | Pinned commit | Role |
|---|---|---|---|
| [darcane/LapScope](https://github.com/darcane/LapScope) | MIT, © 2026 Erdem Darcan | `c39a8d9` (2026-09-13) | **Base.** Imported whole. |
| [ClickClickMedia/Forza-6-telemetry](https://github.com/ClickClickMedia/Forza-6-telemetry) | MIT, © 2026 ClickClickMedia | `523e8ba` (2026-07-28) | **Source for corner analysis.** Selected code adapted. |

## LapScope: what it gives us

Single-driver FH6 recorder and analysis site. Python, FastAPI, uvicorn, SQLite,
no other runtime dependencies, no build step. About 6,000 lines of backend and about
209 tests (153 after the desktop tests were removed).

| Area | File | Use |
|---|---|---|
| Packet parse and pack | `app/telemetry/packet.py` | As is |
| UDP listener | `app/telemetry/listener.py` | One instance per driver |
| Session, lap, finish, rewind, contact detection | `app/recorder/laps.py` | As is; one `SessionTracker` per driver |
| Storage, migrations, manual edits | `app/recorder/store.py` | Add driver columns |
| Reprocess from raw frames | `app/recorder/reprocess.py` | As is |
| Route fingerprint and official route catalogue | `app/tracks.py`, `store.py` | As is; routes shared across drivers |
| Car names | `app/cars.py` | As is |
| REST API | `app/api/routes.py` | Add driver filters and rivalry endpoints |
| Analysis page with multi-lap overlay (up to 6 laps, cross-session) | `app/static/analysis.*` | Add driver labels |
| Scenario tests and packet simulator | `tests/`, `tools/simulator.py` | Keep green; extend to two ports |

Its `AGENTS.md`, `ARCHITECTURE.md` and `docs/wiki/Event-Detection.md` record
detection rules verified against real captures. Read them before touching
`laps.py`.

**What it lacks for our purpose**

- Any notion of a driver. One port, one tracker, one set of bests.
- Records or standings across people.
- Corner-level comparison.
- Access control. It checks the `Host` header only and assumes a home network.
- Timing that has been tested over the internet. It was built for a LAN.

- Support for being served under a URL path. Its pages call absolute
  `/api/...` and `/ws/live`.

**Not needed from it:** `desktop/`, the Windows exe spec and release workflow,
the live dashboard, and the browser-side check for new LapScope releases. Drop
the desktop and exe parts at import. Keep the Dockerfile and compose file.
Leave the live dashboard in place unless it gets in the way.

## Forza-6-telemetry: what we take

A tuning-focused tool. Most of it (dyno, tune export, AI package, MCP server,
garage) is out of scope.

| Area | File | Use |
|---|---|---|
| Corner detection and classification from lateral g, yaw, speed | `app/sections.py` | Adapt the detection approach and thresholds |
| Column-array view of a session | `app/session_data.py` | Reference for a numpy view over LapScope frames |
| Two-run summary deltas | `app/comparison.py` | Reference only |

Its sections are grouped by corner type across a session. SplitTime needs
corners fixed to a route and numbered, so the same corner can be compared
between two drivers. That part is new work. Adapting `sections.py` adds numpy
as a dependency.

**Adapted so far** (WP-005): into `app/corners/detect.py`, from `app/sections.py`
at `523e8ba`: `CORNER_LAT_G` (0.30), `TURN_MIN_HEADING_DEG` (25), and the
hairpin, switchback and sweeper thresholds with their classification rule.
Rewritten, not copied; numpy not used (ADR 19). `session_data.py` and
`comparison.py` were read for reference only.

## Licence duties

MIT requires the copyright and permission notice to travel with the code.

- At import, add `THIRD_PARTY_NOTICES.md` containing both projects' full licence
  texts and the pinned commits.
- Keep existing copyright headers in copied files.
- Record in this file every later sync from upstream, with the new commit.
- SplitTime's own licence is undecided. See open questions in
  [BUILD_PLAN.md](BUILD_PLAN.md#open-questions).

## Import record

| | |
|---|---|
| Import commit | `04260ad` — every imported file byte-identical to upstream `c39a8d9` |
| Cleanup commit | `ed162df` |
| Check | `scripts/verify_upstream_import.py <LapScope checkout> c39a8d9 04260ad` |
| Our changes to upstream code | `git diff 04260ad -- app tools tests` |

Path changes at import, content unchanged: upstream's `README.md`, `AGENTS.md`,
`ARCHITECTURE.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `LICENSE` and its
`docs/` are under [`docs/upstream/`](upstream/). Relative links inside those
documents are therefore broken; read them as reference.

Not imported: `docs/media/hero.gif` and `docs/media/track-map-3d-animated.gif`
(Git LFS pointers upstream).

Removed in the cleanup commit: `desktop/`, `run_desktop.py`, `LapScope.spec`,
`requirements-build.*`, `assets/`, `tests/test_desktop_*.py` (56 tests),
the release and wiki workflows, funding file, issue and PR templates,
`.claude/launch.json`, and the LFS rule in `.gitattributes`.

Syncs from upstream since import: none.

Changes to upstream files since import:

| File | Change | Why |
|---|---|---|
| `docker-compose.yml` | HTTP port published on `127.0.0.1` only | Upstream published it on all interfaces; the API is unauthenticated (PR #4 review) |

Known upstream issues not yet fixed here:

| Where | Issue | Owner |
|---|---|---|
| `app/main.py` `origin_allowed` / `ws_live` | The WebSocket handshake compares `Origin` with `Host` but never checks `Host` against the allow-list, and the HTTP `check_host` middleware does not run for WebSockets. A DNS-rebinding page can therefore subscribe to `/ws/live`. Found by automated review on PR #4; read and judged plausible, not reproduced. | Whoever next changes `app/main.py` (WP-002 or WP-003) |

## Import method

A GitHub fork of a public repository cannot be made private, so LapScope is
imported as a snapshot rather than forked: copy the tree at the pinned commit
into this repo in one commit with no other changes, then modify in later
commits. That keeps `git diff <import-commit>` an exact list of our changes and
makes later upstream syncs manageable. Keep our changes to upstream files
small and put new features in new files where possible.

## SplitTime multi-driver delta (workstream WP-002, pending review)

- `app/telemetry/drivers.py`: parses `SPLITTIME_DRIVERS`, builds a scoped
  Store façade for each recorder. No changes to `laps.py` detector logic.
- `app/recorder/store.py`: SQLite migration v2 (drivers table,
  sessions.driver_id/source_addr); legacy records keep `legacy`.
- `app/main.py`: one Hub, SessionTracker, listener and watchdog per driver.
  The single-driver app.state aliases remain for upstream UI compatibility.
- `app/telemetry/listener.py`: source-change anomaly logging, per-driver
  live-frame identifier. Destination listener defines identity, not source IP.
- `app/api/routes.py`: driver list/filter/status, multi-tracker safety guards.
- `app/main.py`: WebSocket Host allowlist check added to prevent the DNS
  rebinding weakness reported on PR #4; this is a defensive change, not
  evidence that the public deployment is safe.

At the initial two-driver checkpoint, checks were synthetic self-checks only.
The real-capture evidence and subsequent independent reviews are recorded below
and in the current PR description; they do not prove the full field matrix.

### First real Rivals capture: first-line clock reset, 2026-10-12

The owner confirmed Rivals, no rewind, and wall contact. A private snapshot
contained 16,333 frames and one 150.807556 s lap, matching packet LastLap/BestLap.
During approach to the first line, route distance was negative and CurrentLap
counted to 2.493 s. At the line it reset while CurrentRaceTime continued. The
old high-water rewind rule incorrectly flagged that as rewind.

`laps.py` now re-anchors the existing first lap for this observed signature,
using the same flag/trace reset as the existing mid-session re-anchor. No
threshold was changed. The sanitized scalar regression failed before repair;
after repair, real backwards-race-clock and existing dirty-lap tests stay intact.
Replays of separate snapshot copies keep the exact game lap time and contact,
remove false rewind and the spurious clock warning. Original live data and the
read-only snapshot were not reprocessed or edited. Raw captures stay outside Git.

### PR #7 review corrections, 2026-10-12

`app/cars.py` owns a shared name resolver; the session API keeps its existing
helper delegating to it, and the rivalry projection uses the same catalogue
and database overrides. No catalogue or recorded packet was changed.
`app/rivalry.py` uses `flags_auto` for immutable cutoff timing evidence,
effective flags for validity, millisecond display times, and conservative
eligibility when an unknown effective flag appears.

### PR #6 review corrections, 2026-10-12

Port registration now reconciles atomically without deleting old identities.
Source tracking is isolated in `app/telemetry/sources.py`; watchdog/shutdown
flush pending provenance and warnings/writes are coalesced. Existing analysis
group suggestions and API membership/scoring checks are scoped by driver.
Mixed groups already stored remain intact and are refused for combined scoring.
No detector thresholds, `laps.py`, or upstream scenario tests were changed.

### Relative URLs in the upstream pages, 2026-10-12

`analysis.js`, `common.js`, `dashboard.js` and `settings.js` called
`"/api/..."` and `/ws/live` from the site root. Each call is now relative to
the page (`"api/..."`, and the socket path resolved against the page URL), so
the app works under a gateway prefix with no configuration (ADR 16). 37 call
sites, one character each, plus two lines for the socket. On an upstream sync,
re-run `sed -i -E 's#(["`])/api/#\1api/#g'` over those files;
`tests/ui/prefix.test.cjs` fails if an absolute URL comes back.

### Live page for two drivers, 2026-10-12

Owner's request (ADR 22). Changes to imported files:

- `app/static/index.html`: upstream's "Waiting for telemetry" overlay, with
  its Data Out address and port instructions, is removed. In its place is a
  strip of driver cards. Two script tags and one stylesheet link added.
- `app/static/js/dashboard.js`: the single WebSocket (`connect()`), its
  reconnect constants, the `visibilitychange` re-arm and the overlay half of
  `pollStatus()` are removed. Added: `detailFrame()`, `resetDetail()`,
  `staleDetail()`, `setDetailStatus()`, `BLANK_FRAME`; `render()` is split into `render()` and
  `paint(frame, live)`. `showWriteError()` looks at every driver's recorder.
  The gauge drawing, map and collision code are untouched, and `gauges.js`
  is not changed at all.

New files, not from upstream: `app/static/js/livefeeds.js` (one socket per
driver, reconnect, which driver is shown), `app/static/js/liveview.js` (the
cards), `app/static/css/live.css`. `app/main.py` is unchanged: it already
served `ws/live?driver=<id>` per driver and still serves the no-query form.

On an upstream sync, changes to upstream's `connect()` or overlay will
conflict; take ours for those and keep upstream's gauge changes.
