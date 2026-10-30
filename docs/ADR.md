# Architecture decision record

One entry per decision. Status is **Accepted** (the owner decided),
**Proposed** (a working default that the owner has not confirmed) or
**Superseded**. Add new entries at the end; never renumber.

| # | Decision | Status |
|---|---|---|
| 1 | Build on existing MIT projects rather than from scratch | Accepted |
| 2 | LapScope is the base, imported as a snapshot | Proposed |
| 3 | Corner analysis adapted from Forza-6-telemetry | Proposed |
| 4 | Driver identity is the destination UDP port | Accepted |
| 5 | Direct public UDP, no VPN or collector | Accepted |
| 6 | Existing web server fronts the app; no TLS or accounts in the app | Accepted |
| 7 | Record events only; no free-roam storage | Accepted |
| 8 | CSV import dropped from v1 | Accepted |
| 9 | Lap times from game fields; alignment by `DistanceTraveled` | Proposed |
| 10 | Ranking rules | Proposed |
| 11 | Unprivileged process, no Docker | Superseded by 15 |
| 12 | Markdown docs are the source of truth; PDF archived | Accepted |
| 13 | Implementation by the pi agent as a low-privileged user | Superseded by 14 |
| 14 | Agent-agnostic tooling and the Workpacket method | Accepted |
| 15 | Runs as a container or a plain process; nothing privileged | Accepted |
| 16 | The app works under a URL prefix; browser update check removed | Accepted |
| 17 | The owner's deployment is documented separately from the software | Accepted |
| 18 | Workpacket-light, POC-first development | Accepted |
| 19 | Corner analysis uses the standard library only, not numpy | Proposed |

| 20 | A reviewed merge to `main` counts as owner acceptance | Accepted |
| 21 | Less merge friction: reviewer merges; packet check advisory | Accepted |
| 22 | Optional two-driver Live view | Accepted |
| 23 | Record public viewing separately from protected management | Proposed |
| 24 | Collector and web may run as separate processes | Proposed |
| 25 | Compact Rivalry v2 alongside the original | Proposed |
| 26 | Rivalry v2 is Rivalry; the original is Rivalry_legacy | Accepted |
| 27 | Which laps count as a best; sittings are grouped automatically | Accepted |
| 28 | Stats page: server-described sections over the recorded index | Accepted |
| 29 | Race replay: recorded laps played together on the map | Accepted |
| 30 | A gridded run is timed only if it covered the full route | Accepted |
| 31 | Attempts are counted; given-up events stay discarded | Accepted |

Each entry lists what it **rests on**, so that reversing one decision shows
which others to revisit.

---

## 1. Build on existing MIT projects

**Accepted, 2026-10-12.**
The concept PDF listed LapScope and Forza-6-telemetry as its research basis.
Both are MIT-licensed and already solve packet parsing, event detection and
route matching against real captures. Reuse their code. Obligations are in
[UPSTREAM.md](UPSTREAM.md).

## 2. LapScope is the base, imported as a snapshot

**Proposed, 2026-10-12.**
LapScope's stack is the one the concept already chose (FastAPI, asyncio,
SQLite). Its tracker, store, reprocess and tests are tightly coupled, so
taking it whole is safer than lifting parts. Its tracker keeps state per
instance, so running one per driver needs no rewrite.

Import the tree at commit `c39a8d9` in a single unmodified commit, then change
it. A GitHub fork was rejected because a fork of a public repo cannot be
private. Starting from Forza-6-telemetry was rejected because it is built
around tuning, and its storage is CSV or Parquet files.

*Consequence:* upstream fixes are pulled by hand. Keep edits to upstream files
small.

## 3. Corner analysis adapted from Forza-6-telemetry

**Proposed, 2026-10-12.**
Its `sections.py` detects and classifies corners from lateral g, yaw and speed
with documented thresholds. Adapt that detection. Route-fixed, numbered corners
and the two-lap comparison are new work. Adds numpy.

## 4. Driver identity is the destination UDP port

**Accepted, 2026-10-12** (concept PDF default).
Each driver gets a port. Source IP changes, can be shared, and is recorded only
as evidence. Defaults: 9999 and 10000, configurable, never in 5200–5300.

## 5. Direct public UDP, no VPN or collector

**Accepted, 2026-10-12** (owner confirmed after the hosting review).
A home-side collector or VPN is extra setup for each player. For two friends
the risk of forged packets is accepted. Mitigations: drop wrong-size packets,
log source changes, optional firewall rate limit. Revisit if junk data ever
appears.

*Consequence:* a CDN or tunnel in front of the website does not carry UDP, so
drivers are given the server's own IP address.

## 6. Existing web server fronts the app

**Accepted, 2026-10-12.**
The owner will reuse a web server already running on the host. It handles TLS,
certificates and port 443. The app binds HTTP on loopback only.

Access control is done there too, because the app's API has no authentication
and includes delete, edit and reprocess. On the owner's system this is the
existing gateway's login gate (ADR 17). ADR 23 records the later distinction
between public viewing and protected management in the reference deployment.

## 7. Record events only

**Accepted, 2026-10-12.**
No free-roam storage. LapScope already discards sessions that end with no
completed lap or run. It does write their frames to disk while they are in
progress and deletes them at close; whether that churn matters is risk R2 in
[BUILD_PLAN.md](BUILD_PLAN.md#risks).

## 8. CSV import dropped from v1

**Accepted, 2026-10-12.**
The concept listed CSV as a fallback and test input without naming a format.
Replaying stored raw packets and the upstream simulator cover testing. Tracked
as deferred.

## 9. Lap times from game fields; alignment by `DistanceTraveled`

**Proposed, 2026-10-12.**
Packets cross the internet, so arrival times carry jitter and loss. Lap times
come from `LastLap` and the race clock. Laps are aligned on
`DistanceTraveled`, which is a per-route position parameter and therefore
comparable between drivers. Durations inside the detector should use the
packet's `TimestampMS` where upstream uses arrival time; confirm against real
internet captures before changing anything (risk R1).

## 10. Ranking rules

**Proposed, 2026-10-12.** These answer the concept's open questions with
defaults so that building can proceed. All are cheap to change later because
rankings are computed from stored laps.

- Category is route × car class. Car and PI are shown but do not split the
  table.
- A category's record is the best accepted, complete, continuous lap or run.
- Laps flagged rewind, contact, cutoff or gapped are excluded from ranking by
  default and remain visible.
- Either driver may edit flags. Edits are stored separately from raw data and
  survive reprocess.
- Rivals and race laps on the same route share a table. Split them only if
  real data shows the timing differs.
- Rivalry score is the number of categories each driver leads.
- Raw recordings are kept indefinitely. The site shows storage used.

## 11. Unprivileged process, no Docker

**Superseded by 15, 2026-10-12.** The owner's gateway runs its services as
containers. Original text kept for the record:

The app needs no privileged ports. Run it from a virtualenv as a dedicated
user under a systemd unit. Docker is avoided because membership of the docker
group is root-equivalent, which defeats the low-privilege agent, and because
Docker's firewall rules bypass ufw. Root is needed once for user creation,
firewall, the proxy site and the service unit; see [SETUP.md](SETUP.md).

## 12. Markdown docs are the source of truth

**Accepted, 2026-10-12.**
The concept PDF is archived in `docs/archive/` and is not maintained.
`docs/DESIGN.md` replaces it. Coding agents cannot be relied on to read PDFs.

## 13. Implementation by the pi agent as a low-privileged user

**Superseded by 14, 2026-10-12.** The owner dropped pi for this iteration.
Original text kept for the record:

pi has no permission prompts or sandbox of its own, so the Unix account is the
containment. The agent never uses sudo. Anything that needs root is written up
for the owner to run.

## 14. Agent-agnostic tooling and the Workpacket method

**Accepted, 2026-10-12.**
No document or process depends on one coding agent. `AGENTS.md` holds the
rules; `CLAUDE.md` only points to it. Work is organised as Workpackets, a
light git-native form of the owner's method, described in
[WORKPACKETS.md](WORKPACKETS.md): markdown packets in `work/`, with worker,
verifier and acceptor kept apart and the owner as the only acceptor.

The low-privilege rule from entry 13 stays: whatever agent is used never acts
as root, and root steps are written up for the owner.

*Rests on:* nothing else. *Consequence:* no signatures or JSON packets; git
provides history and authorship.

## 15. Runs as a container or a plain process; nothing privileged

**Accepted, 2026-10-12.**
The software must run either way. Upstream's Dockerfile is kept. It needs no
privileged ports and no root at run time. The owner's deployment uses a
container; a coding agent's account still stays out of the docker group.

*Rests on:* 2 (upstream ships a Dockerfile). *Supersedes:* 11.

## 16. The app works under a URL prefix; browser update check removed

**Accepted, 2026-10-12.**
Upstream pages call absolute `/api/...` and `/ws/live`, which breaks behind a
gateway that serves the app under a path and has its own `/api`. Make the
prefix configurable, defaulting to none. This is useful to anyone using a
reverse proxy, not only the owner. Upstream's browser-side check for new
LapScope releases is removed: it would point users at the wrong project and
is an outbound call nobody asked for.

*Implemented 2026-10-12 without a setting:* the pages use URLs relative to
the page, so any prefix works once the proxy strips it. The update check is
not yet removed.

*Rests on:* 2, 6. *Work:* WP-003.

## 17. The owner's deployment is documented separately from the software

**Accepted, 2026-10-12.**
The owner hosts SplitTime under test.hensler.work, as a container in an
existing gateway at path `/splittime/`, with telemetry going directly to the
server's public IP. That is one deployment, described in
[hosting/test-hensler-work.md](hosting/test-hensler-work.md). No site-specific
name, path or assumption goes into the code or the generic documents.

*Rests on:* 5, 6, 15, 16.

## 18. Workpacket-light, POC-first development

**Accepted, 2026-10-12 (owner's direction).** The objective is to produce a
nearly complete usable SplitTime WIP/POC quickly. The Workpacket method is a
secondary, lightweight experiment: retain bounded intent, evidence, honest
unknowns and a checkpoint, but do **not** build a Workpacket runtime or require
a ritual verification/acceptance stop between every small development step.

A worker may test its own work and continue across authorized coding slices.
Self-checks remain distinguishable from independent verification; only the
owner accepts outcomes or authorizes deployment and consequential access
changes. This qualifies ADR 14 rather than superseding its agent neutrality,
least privilege or separation of verification from acceptance.

*Consequence:* the implementation handoff and workflow guidance live in
`docs/REVIEW_HANDOFF_2026-10-12.md`, `AGENTS.md` and `docs/WORKPACKETS.md`.

## 19. Corner analysis uses the standard library only, not numpy

**Proposed, 2026-10-12** (Opus 5.5, with the corner module).
ADR 3 expected numpy to arrive with the corner code. It was not needed: a lap
is a few thousand samples, and the comparison endpoint takes about 150 ms for
three simulated laps, most of it reading and parsing frames. Upstream runs on
two runtime dependencies and its Docker image installs only those; keeping it
that way avoids a Dockerfile and requirements change.

The detection approach and thresholds still come from Forza-6-telemetry's
`sections.py` (ADR 3); only the array library differs.

*Rests on:* 3. *Revisit if* laps of tens of thousands of samples make the
pure-Python pass slow.

## 20. A reviewed merge to `main` counts as owner acceptance

**Accepted, 2026-10-12** (owner, "in this instance": for this project's POC).
(Number 19 is taken by an entry on the corner-analysis branch.)

The method kept acceptance for the owner alone, but in the first day nothing
was accepted while merged work was already being built on. The owner settled
it: a merge to `main` is acceptance, provided someone other than the author
reviewed the pull request and the author did not merge it.

Acceptance covers what the pull request claims. Items it lists as untested,
unknown or asserted are not accepted as true by the merge. Deployment, gateway
or firewall changes and anything needing root are outside this and still need
the owner's explicit go-ahead.

*Rests on:* 14, 18. *Revisit* when the project leaves POC or gains users.

## 21. Less merge friction: no stacked pull requests, the reviewer merges

**Accepted, 2026-10-12** (owner, after PR #10 merged).

The first day of building produced five pull requests touching the same code
(#5, #6, #7, #9 and the integration #10). Fixes had to be carried forward by
hand, reviews were of commits that had already moved, and every merge and
most messages between agents waited on the owner. Four changes:

1. **One short-lived pull request per slice, based on `main`.** No pull
   request is based on another open one.
2. **The reviewer merges.** A reviewer other than the author, finding nothing
   blocking, with CI green, merges without asking the owner. This refines
   ADR 20: the merge is still the owner's acceptance of what the pull request
   claims, now delegated to the reviewer. The author still does not merge
   their own code.
3. **Docs-only pull requests need no review** and may be merged by their
   author on green CI. `AGENTS.md` and `docs/ADR.md` are excluded.
4. **Less process:** one CI workflow in place of four; the Workpacket record
   check stays advisory; the "On `main`" table in `BUILD_PLAN.md` is removed
   in favour of `git log`.

Unchanged: deployment, gateway or firewall changes and anything needing root
need the owner's explicit go-ahead. Agents do not poll the repository on a
timer; the owner declined that for now.

Where `docs/PARALLEL_BUILD.md` describes stacked branches or a single
integrator who merges, this entry replaces it.

*Rests on:* 18, 20. *Revisit if* a merged change has to be reverted because
the reviewer missed something the owner would have caught.

## 22. The Live page stays, as an optional view of both drivers

**Accepted, 2026-10-12** (owner, after the first deployment).

The design left upstream's live dashboard in place and out of scope. Once the
site was public the owner looked at it: it showed `127.0.0.1` and one port,
which suits one person on their own PC and not two remote drivers. The owner's
decision: keep live viewing ("may as well still allow viewing live races"),
do not advertise an address or port, and make it work when both are driving.

So the Live page is kept as a spectator view. It shows each configured driver
side by side and one of them in detail. It displays no setup instructions; how
a driver points their game at a server is in the setup and hosting documents.
It does not compare or rank the two live: they can be on different routes.

This does not change what v1 is for. The product is still the after-race
comparison, and nothing about the Live page is an acceptance criterion.

*Rests on:* 16. *Work:* WP-006 (optional Live view).

## 23. Record public viewing separately from protected management

**Proposed, 2026-10-12** (documentation reconciliation after PR #16 review).

The checked reference deployment already makes GET/HEAD and browser WebSocket
viewing public, following the owner's public projects-page request. Every other
HTTP method requires the expected Origin, gateway login and `splittime` service
grant. The original private-site wording in DESIGN and ADR 6 omitted this split.

The public read scope includes CSV exports and packet-field telemetry, not just
page summaries. This entry documents the deployed scope; it does not grant new
publication authority or claim the owner separately approved every export
endpoint. Restricting export access would require a separate gateway change.
The app itself remains unauthenticated behind the gateway; no access rule is
changed by this documentation repair. Host-specific evidence stays in the
[hosting record](hosting/test-hensler-work.md).

*Rests on:* 6, 17, 22. *Revisit if* the intended public data scope changes.

## 24. Collector and web may run as separate processes

**Proposed, 2026-10-12** (owner asked for an always-on collector after the
third rebuild of the day; not yet deployed).

One process did everything, so every rebuild for a page or analysis change
also stopped the recorder, and a driver mid-lap lost that lap. `SPLITTIME_ROLE`
now selects what a process is:

| Role | UDP, lap detection, recording | HTTP |
|---|---|---|
| `all` (default) | yes | everything, as before |
| `collector` | yes | `GET /api/status` and `/ws/live` only |
| `web` | no | pages and the whole API; no live socket |

Both halves run the same code and open the same SQLite file. The web half
never binds a driver port and skips the startup cleanup, which closes every
open session and would end the collector's live one. It gets live state by
asking the collector (`SPLITTIME_COLLECTOR_URL`), and when the collector does
not answer it refuses reprocess, import, compact and delete with 503 rather
than assume nothing is recording. Session ids are allocated in the database,
not from a counter in memory, so the two cannot hand out the same one. The
front web server sends `/ws/live` to the collector and everything else to web.

"Collector" here is a server-side process. ADR 5's rejected collector is a
home-side one on each player's network; that decision is unchanged.

Limits:

- Lap detection still lives in the collector, so a recorder fix needs a
  collector restart. Kept sessions can be rebuilt afterwards with reprocess;
  discarded free roam cannot.
- A session that starts while the web half is in the middle of a reprocess or
  import waits for that write: the collector retries every 0.25 s, logs each
  failed attempt, and the session begins when the write ends. Frames of an
  already open session are buffered and lose nothing.
- The collector reads car and route catalogues at start. A refresh done on
  the web half reaches it at its next restart.
- A release that changes the schema must update both halves.

*Rests on:* 6, 15. *Work:* WP-007. *Revisit if* detection is ever moved out of
the recording path, which would let the collector store raw packets only.

## 25. Compact Rivalry v2 alongside the original

**Proposed, 2026-10-12** (owner approved the compact workspace preview and
requested Rivalry v2 on the main page while retaining the original).

Use one dense route/class table and one selected history/comparison region.
Search covers routes, drivers, cars, dates and flags. Show recorded bests,
gaps and dated improvements, with one expandable provenance explanation.
Keep configured driver order, real route outlines and explicit A/B choices;
never populate a missing opponent with illustrative data. The read projection
adds the stored capture-finish timestamp without changing recordings.
Missing chronology remains unknown. All differences remain exploratory.

The separate merge/grouping review proposes clearer wording and deliberate
selection in `MERGE_RUNS_UX_REVIEW.md`; this slice changes no grouping semantics.
Deploy only the existing web process; the existing collector stays running.

*Rests on:* 10, 23, 24. *Work:* WP-004.

## 26. Rivalry v2 is Rivalry; the original is Rivalry_legacy

**Accepted, 2026-10-13** (owner request after the first user feedback).

The compact workspace of ADR 25 is the page people should land on, so it takes
the name **Rivalry** and comes first in the navigation. The original page stays
available as **Rivalry_legacy**. Only labels, titles and navigation order
change: `rivalry-v2.html` and `rivalry.html` keep their file names and URLs so
existing links keep working. "Rivalry v2" in earlier entries and work packets
means the page now called Rivalry.

*Supersedes the naming in:* 25. *Work:* WP-004.

## 27. Which laps count as a best; sittings are grouped automatically

**Accepted, 2026-10-13** (owner decisions after the first user feedback).

The site exists to track each driver's best valid times, compared as the game
compares them. The game never sends its own verdict, so the rule is SplitTime's
reading of the telemetry, decided in one place (`app/rivalry.py`):

- A rewind or a contact disqualifies a lap. The effective flags are used, so a
  contact the driver dismissed no longer counts against it. An excluded lap
  never counts. Leaving the course is not detected.
- A run timed from the last packet (`cutoff`: the game stopped sending at the
  line) counts only when its last frame shows the whole route covered
  (`FULL_ROUTE_UNITS`; the odometer reads about 5950 at the end of every
  completed lap or run). It is reported as `finish: "last_packet"` and marked
  "est." wherever it is shown. This reverses the earlier rule that an estimated
  time can never be a best; a cutoff time with no frames to prove its distance
  still cannot.
- The headline best is per route and car class. The same route's bests per car
  and overall are shown beneath it.
- Restarts of one event in one sitting (same driver, route and car, each within
  two hours of the previous) are grouped by the recorder at session close and
  at startup. A group is still only an index. A person's split is remembered
  (`no_auto_group`), and a manual merge may take sessions out of an automatic
  group. The merge prompt is gone; this supersedes the wording proposals in
  `MERGE_RUNS_UX_REVIEW.md`.
- Other laps stay one click away; the page opens on best times.
- Event modes (race, rivals, drift) are still counted together with the guess
  shown. Separating them, as the game does, waits on kept captures of each mode.
- Differences between drivers remain exploratory (10): a shared route
  fingerprint and class do not prove equal conditions.

*Rests on:* 9, 10, 25. *Work:* WP-008.

## 28. Stats page: server-described sections over the recorded index

**Accepted, 2026-10-13** (owner request: ten or more sections of statistics,
leaderboards measured several ways, goals and achievements, in the same calm
styling, under Stats next to Rivalry).

- `app/stats.py` derives every table from the session list and the rivalry
  projection, so "valid" means exactly what it means on Rivalry (27) and no
  frames are read. `GET /api/stats` returns display-ordered sections; the page
  renders whatever it is given, so a new statistic is a server change only.
- Every table is keyed by driver id for any number of drivers.
- Comparisons stay exploratory (10): the response carries `scoring`, ranking
  tables say so, an identical time is a tie that counts for nobody, and a
  time taken from the last packet keeps its "est." marker.
- Unknown route, car or class (imported sessions) is never counted as one.
- Achievements are a rule table over the same numbers; goals are the nearest
  unearned ones.
- Not yet: charts, and numbers that need every frame (top speed, air time).

*Rests on:* 10, 25, 27. *Work:* WP-008.

## 29. Race replay: recorded laps played together on the map

**Accepted, 2026-10-13** (owner request: pick two races and watch the dots race
together, with a 3D option, a follow camera and live stats, shareable).

- `replay.html?laps=a,b[,c…]` plays up to six recorded laps in sync, each from
  its own start line. It is a picture of recordings, not a result: the laps
  were driven at different times, and the gap shown is how much later a car
  reaches the leader's spot on the route. Laps from different routes still
  play, with a notice that the gaps mean little.
- No new API: `GET api/laps/{id}/data` and `api/rivalry`. Viewing is public
  like every other read (23), so the address is the share link.
- The maths lives in `js/replay-model.js`, tested without a browser. The
  projection is a small one of its own; Analysis's map drawing is tied to that
  page's state and was not pulled apart for this.
- Top, tilted and follow cameras. Nothing assumes two cars.

*Rests on:* 9, 23, 25. *Work:* WP-008.

## 30. A gridded run is timed only if it covered the full route

**Accepted, 2026-10-13** (owner: "go ahead with fix 1", after two abandoned
runs showed up as unnamed routes).

- FH6's odometer reads about 5950 at the end of every completed route. A
  gridded point-to-point run is given a time only when it has covered 98.5% of
  that (`FULL_ROUTE_MIN` in `laps.py`), wherever a run without a lap
  boundary is finished: the odometer hard-reset, the frozen race clock and
  the last-packet recovery.
- Evidence: two captures of one driver giving up a sprint, at 42% (odometer
  reset after a 5.5 s gap, car stopped) and 69% (stream cut while rolling at
  22 km/h). Both had been timed, and each made a route. Replaying every
  session in the first two-driver database through the new rule changed those
  two and no other.
- Not applied to events with no lap clock (geometric laps): no capture shows
  their odometer at the end of a single run.
- A reprocess clears the session's route before replaying, so a run that no
  longer counts does not keep the route the old rule made.
- The simulator's sprints now normalise their odometer the way the game does.
- The best-lap rule keeps its own full-route test (27) for recordings made
  before this.

*Rests on:* 9, 27. *Work:* WP-008.

## 31. Attempts are counted; given-up events stay discarded

**Accepted, 2026-10-13** (owner: "leave it as discard for now, but players want
a record of # of attempts"; "ten attempts means ten attempts").

- An attempt is one started event. Finished: a kept session with at least one
  timed lap or run. Given up: the session ended with none.
- A given-up session is still deleted with its packets. As it goes, the
  recorder writes one row to `attempts`: driver, car, times, where it started
  and how far the odometer got. No minimum distance.
- Started means a race (gridded) or a lap-timed event whose odometer left the
  line. Events with no lap fields at all are not counted when given up: from
  telemetry they look like free roam.
- The route is worked out when read, from the start position: the one recorded
  route starting within the fingerprint radius, else the one catalogue course,
  else "Unknown route". So attempts at a course nobody has finished yet are
  still named, and join the route once someone finishes it.
- Shown in Stats ("Attempts") and as "Starts" per route on Rivalry. Kept
  sessions with no route and no time no longer get a Rivalry row of their own.
- Known gap: a restart within the first 10 s of the race clock does not split
  the session (`RACE_TIME_RESET_JUMP`), so it is not a separate attempt.
  Telling it from a rewind needs a real capture of one.
- Supersedes the "incomplete-attempt summary" wording in DESIGN.md.

*Rests on:* 7, 27, 30. *Work:* WP-008.

## 32. Measured session debrief with optional bounded AI priorities

**Accepted scope, 2026-10-13** (owner: "add the session debrief as described",
OpenRouter with Gemini 3.8 Flash). Implementation defaults below are **Proposed**.

- Expand under the selected event in Rivalry: A's closed session, B as reference.
  Local code computes eligible session best, earlier same-driver/car/PI best,
  confirmed-time consistency and measured corner differences. A lap/run is not
  an event start. Full-route cutoff estimates retain ADR 27 best eligibility,
  but are not confirmed consistency samples. They are corner coaching evidence
  (owner, 2026-10-25): every sprint ends on the last packet, corner times come
  from the game clock sample by sample, and only the finish is inferred, so the
  report says so in a warning.
- Gemini selects supported facts and one allowed practice hypothesis; templates
  supply every numerical claim. No causal diagnosis, official winner or tuning
  advice. Unknown car/PI, clocks, capture gaps and edits remain explicit.
- Explicit management POST uses `google/gemini-3.8-flash` through OpenRouter,
  standard `google-vertex/global`, ZDR/no data collection, no fallback, tools
  or automatic retries. Only anonymous derived numeric facts leave the server;
  keys stay in environment. Viewing never triggers inference.
- Web-owned `debrief.db` caches by source/pair/detector/prompt/model versions
  and atomically reserves $0.01/call against $1 per UTC month. Unknown charges
  stay reserved; explicit retries reserve again. Known per-call overcharges
  stop generation for that month. Preserve the ledger on restart/rollback;
  restoring an older ledger loses budget history and requires disabling AI
  until the next month.
- Collector and telemetry schema are unchanged. The existing gateway protects
  generation with its management POST policy; no new hosting service.

*Rests on:* 23, 24, 27, 31. *Work:* WP-004.

## 33. Race report: section facts and a fact-checked AI narrative

**Proposed, 2026-10-25** (owner asked for a race review "like a real racer would
review", after a hand-written one for laps 98 vs 174). Defaults below are the
implementer's; the owner has not confirmed them.

- Under the selected A/B pair in Rivalry. Local code measures both runs over 4–7
  route sections built from the corner segments: time gained, running lead,
  full-throttle/brake/coast shares, speeds, peak lateral g, rear wheelspin and
  largest line gap, plus the four corners with the largest time difference
  (speeds, gear at the slowest point, brake and throttle points) and whole-run
  input style (on/off devices send only end values). Differences are computed
  here, so a writer never does arithmetic. Pairs must be eligible bests on the
  same known route with continuous captures; different cars are allowed and say so.
- Distances are metres: the game's `distance_traveled` is a route parameter
  (about 5,950 units on every lap, whatever its length), so every position and
  distance is converted with the reference lap's `metres_per_unit`, and the
  page says the result is approximate.
- Unlike ADR 32, the model writes its own sentences: a headline, a story, and per
  driver up to three strengths and costs and one practice focus. The output is
  checked instead of templated. Each number must match a measured fact of the
  same unit (s, km/h, %, g, m or km; lap times as m:ss) after the writer's own
  rounding, and each corner it names must have been measured. Only unitless
  whole numbers up to 10 (counts, ordinals) pass unchecked. A narrative that
  fails is not shown, and its charge is kept. This proves every number was
  measured, not that it is attached to the right claim.
  2026-10-28: the check had rejected every review mentioning "the first
  250 m", a number that lived only in the key `first_250m_s`. The launch is
  now two values (`first_stretch_m`, `first_stretch_s`), numbers never appear
  in fact names, and a test states every fact plainly and requires the check
  to pass it. Reviews cached under the old key move to the new one when next
  viewed or requested (`legacy_fingerprint`), with no new call. The newest 50 rejected
  answers are kept with their reason in the ledger (`rejected`, never shown),
  so a failure can be read instead of guessed at.
- The configured gamertags are sent so the review names the drivers (owner,
  2026-10-25: "I want to know who I am racing"). The output stores them as {A}
  and {B}, so a digit in a gamertag is never checked as a number and the page
  substitutes the names after escaping. Two runs by one driver are sent as
  "name (A)" and "name (B)". No car names, route names, timestamps or raw
  packets are sent; a rename is a new report.
- Same provider policy, model, management POST, ledger file and $1 UTC-month
  budget as ADR 32, under a separate cache key. Requests are sized to fit the
  $0.01 worst-case reservation. Viewing never triggers inference.
- Generation was manual at first; ADR 34 adds writing one when a record
  changes hands.

*Rests on:* 27, 30, 32. *Work:* WP-004.

## 34. A race report is written when a record changes hands

**Proposed, 2026-10-25** (owner agreed the order: findability, then an
automatic race report on each lead change, then a per-driver view, then
notifications). Defaults below are the implementer's; the owner has not
confirmed them.

- The web role, when it has a provider key, checks every 5 minutes for
  takeovers in the last 14 days: a clean best that beats the route-and-class
  record held by another driver, including a first answer that beats the only
  time. Laps finishing at the same instant are one batch, and a group with an
  undated clean lap is skipped, as on the Rivalry page.
- Each takeover is written once, through the same bounded, cached path as the
  management button (ADR 33): the new record as A, the record it beat as B.
  Nothing new leaves the server. A cached or failed report is never sent
  again automatically; a session still recording waits for the next pass;
  an ineligible pair is skipped.
- Every takeover handled is kept in an `auto_reports` table in the ledger
  file, keyed by both runs' session and start time (lap IDs can be reused),
  so a restart or a later cache change never sends it again. A tie takes
  nothing. Laps
  finishing at the same instant count as a takeover only if the holder after
  the whole batch changed.
- Automatic calls stop at 20 per UTC month (at most $0.20 at the $0.01
  reservation), counted from that table,
  so most of the shared $1 month stays for manual use. A spent budget pauses
  the pass. `SPLITTIME_AUTO_RACE_REPORTS=0` turns it off.
- This relaxes ADR 33's "generation is manual": inference is still never
  triggered by viewing, only by a recorded change of record holder.

*Rests on:* 32, 33. *Work:* WP-004.

## 35. History: then vs now, and a weekly recap

**Proposed, 2026-10-29** (owner asked for "historical" reporting to keep the
drivers interested and give them insight, and approved four pieces in order:
then vs now and a weekly recap together, then "within reach", then
milestones). Defaults below are the implementer's; the owner has not
confirmed them.

- **Then vs now** is a mode of the race report (ADR 33): the same measured
  section facts and the same check, for one driver's current best (A, "now")
  against their first clean run on that route and class (B, "then"). A pair
  of two drivers is refused. It has its own prompt (what improved, what is
  still to find, one practice focus), its own output shape and its own cache
  entry, so a race report for the same two laps is unaffected. It is shown
  under the Rivalry workspace for every driver whose best is a later, faster
  run than their first; undated runs have no "first" and are left out. It is
  written on request only.
- **The weekly recap** measures one Monday-to-Sunday week in the drivers'
  time zone (`RECAP_TZ`, default America/Halifax; a week is 167 or 169 hours
  across a DST change) from the rivalry projection, so a lap counts exactly as
  on Rivalry and Stats and nothing reads frames. Per driver: laps, valid
  laps, sessions, routes, new routes, personal bests, and records held at the
  start and end of the week; plus the week's personal bests (with the time
  improved), records that changed hands (ADR 34's takeovers) and the busiest
  route. Only drivers and routes that existed by the week's end are included,
  so later driving never changes a finished week or its cached column.
- The recap column is written by the same model under the same check: every
  number must be a measured fact (no dates are sent), no corners exist, and
  driver and route names are stored as placeholders ({D1}, {R1}) the page
  fills in after escaping. Same provider policy, ledger, $0.01 reservation and
  $1 UTC-month budget as ADRs 32–34; a rejected column is kept with its reason.
- A finished week is written once, about an hour after it ends, by a pass
  every 30 minutes (`auto_recaps` table; `SPLITTIME_AUTO_RECAPS=0` turns it
  off). Only the last week is written automatically; older finished weeks can
  be written with the button. The current week is shown measured, without a
  column. A week with nothing recorded is skipped at no cost. At most about
  five automatic calls a month.
- A new Recap page lists up to 12 weeks, newest first.

*Rests on:* 27, 28, 33, 34. *Work:* WP-004.

## 36. Open pages offer a refresh when results change

**Proposed, 2026-10-30** (owner: pages do not update after a race, and a
driver waited a long time to see a result; "no need to overload the server,
there are only 2 of us racing - and sporadically").

- `GET /api/changes` returns a short token: a hash of what the result pages
  read (finished sessions and laps, attempts, edits, route, group and car
  names, and how many AI reports are finished). Frames, and a session or lap
  still recording, are left out, so a recording changes it only when a lap
  finishes. It reads the ledger read-only and never creates it. About 4 ms on
  the live data.
- Rivalry, Rivalry_legacy, Stats, Recap, Replay, Compare and Analysis load
  `js/updates.js` in `<head>`. It reads the token on load, and the page's own
  `api/` requests wait for it (at most 2 s, after which the first token
  offers a refresh), so the starting token is never newer than the results
  on screen. Then it reads it once a minute while the
  tab is visible and on coming back to it (at most every 15 s). When it
  differs, a bar says results have changed, with Refresh (reloads the page)
  and Later (keeps watching from the new token). It stops asking while the
  bar is up. If the first read fails, the first one that works offers a
  refresh, since the page cannot know what it is showing. Nothing reloads by itself, so nothing being read or edited is
  lost; Live already updates over its socket and is left out.
- A driver's own edit also changes the token, so the bar can appear after
  it; the text says results changed, not who changed them.
- Two drivers with one tab each make about two small requests a minute,
  none from hidden tabs. Rejected: a socket or server push (more moving parts
  for two people), and reloading by itself (loses what is open).

*Rests on:* 24. *Work:* WP-004, WP-006.

## 37. Within reach, in the weekly recap

**Proposed, 2026-10-30** (owner approved "within reach" as the third history
piece, folded into the recap: the closest records to take back and where the
gap is).

- Each week's facts gain `within_reach`: for every driver, up to three
  records someone else holds at the week's end that their own clean best is
  closest to (route, class, holder, both times with their provenance, and the
  gap). Records are the rivalry projection's, as for records held (ADR 35); a
  tie is held by nobody and so is no one's to take. Nothing reads frames.
- Where the gap is: each entry links to the race report for that pair
  (ADR 33), which already measures it section by section, and to Replay. The
  recap itself does not build race reports: twelve weeks of them would be far
  heavier than the page. The pair's lap ids go with the report, not in the
  facts, so they are never numbers the column may state.
- The column's prompt (version 2) mentions within reach, points `next_week`
  at the closest one, and asks for lap times as m:ss.sss. Columns already
  written keep their key: the report carries the version 1 fingerprint, and a
  column cached under it moves to the new key (as in ADR 33's rename), so
  nothing is paid for twice. Route placeholders new to the facts are numbered
  after the existing ones, so a moved column's {R2} still names the same
  route. A moved column keeps its own wording.

*Rests on:* 33, 35. *Work:* WP-004.
