# Build plan

## Session debrief checkpoint, 2026-10-13

Authorized scope: expandable A-session measured summary in Rivalry, B reference,
optional OpenRouter/Gemini 3.8 Flash priorities with $1/UTC-month inference cap.
Implementation/review record: WP-004. No recorder/schema/collector changes.
Independent reviewer is GPT-6 Astra (implementer GPT-6.1 Sol).
Worker checks: 340 Python tests, 78 Node tests and Ruff pass. Actual synthetic
Gemini smoke returned the exact requested model and a validated report for
$0.000414; a repeat cache claim made no new call. Initial timeout kept its
$0.01 reservation. Browser preview also generated/cached a synthetic debrief.
GPT-6 Astra reviewed final head `07b2626`; PR #37 merged at `2e325f5` on green
CI, and site configuration PR #120 merged at `9fda383`. Both are deployed.
Live browser shows session/corner measurements; anonymous generation requires
login. Missing/cross-origin POSTs return 403, valid-origin anonymous POST
redirects to login, public measured GET returns 200. Server key validity read
passed. Collector/29 other containers and 17 closed recordings unchanged.
Actual signed-in live inference remains untested; an extra internal operator
smoke call was rejected by automatic approval review and was not executed.

Each milestone is a Workpacket in [`../work/`](../work/). The packet holds the
authority, acceptance criteria, evidence and checkpoint; this file holds the
overview, risks, deferred items and open questions. See
[WORKPACKETS.md](WORKPACKETS.md).

## POC-first delivery (owner direction, 2026-10-12)

The goal is a nearly complete **working** WIP/POC, not a Workpacket runtime.
Existing workpackets are convenient checklists and handoff notes, **not strict
per-milestone approval gates**. Keep evidence and tests, but spend engineering
time on running software and usable post-race comparisons.

Fast path: import the pinned LapScope baseline; accept two independent UDP
feeds; show a basic two-driver route/records webpage using simulator captures;
deploy behind a verified access-controlled gateway; then validate with real
captures and add corner comparisons/polish. Some UI work may start before
both people have supplied every planned event type. Do not call simulated
data real or treat unverified detection as accepted. Public deployment and
privileged gateway/firewall changes still require the owner's authority.

See [REVIEW_HANDOFF_2026-10-12.md](REVIEW_HANDOFF_2026-10-12.md) for technical
corrections and independent acceptance tests.

## Status

What is on `main` is whatever `git log --first-parent main` and the
[merged pull requests](https://github.com/adrianhensler/splittime/pulls?q=is%3Apr+is%3Amerged)
say. It is not tracked in a table here: two versions of one were tried on
2026-10-12 and both were stale at the first merge that should have updated
them (ADR 21). Work in review is the open pull request list. Each packet's
checkpoint says what its milestone still owes.

| Milestone | Packet |
|---|---|
| Planning docs | [WP-000](../work/WP-000-planning.md) |
| M0 Import baseline | [WP-001](../work/WP-001-import-baseline.md) |
| M1 Two drivers | [WP-002](../work/WP-002-two-drivers.md) |
| M2 Deploy and real captures | [WP-003](../work/WP-003-deploy-and-real-captures.md) |
| M3 Rivalry views | [WP-004](../work/WP-004-rivalry-views.md) |
| M4 Corner comparison | [WP-005](../work/WP-005-corner-comparison.md) |
| M5 Summary page and polish | [WP-006](../work/WP-006-summary-page.md) |
| Always-on collector (after v1 scope; ADR 24) | [WP-007](../work/WP-007-collector-split.md) |

## Milestones in one line each

- **M0** LapScope imported unchanged at `c39a8d9`, trimmed, tests passing.
- **M1** One listener and tracker per driver; sessions attributed by port.
- **M2** Works under a URL prefix; deployed; both drivers record real events;
  risks R1 to R3 measured.
- **M3** Driver labels, records per route and class, rivalry score, ranked
  versus exploratory.
- **M4** Fixed numbered corners per route; two-lap corner table.
- **M5** One summary page per route; storage display.

## Completion and next finish lines

Assessment dated 2026-10-12 after the reviewed shared deployment: the integrated
POC, prefix and optional Live slices are merged, and runtime `bc5f836` is
running behind the gateway. See WP-003 and the [hosting record](hosting/test-hensler-work.md) for
deployment evidence and site-specific access/settings. This is an evidence
snapshot; Git history and the PR list remain the source for subsequent changes.

The shared capture-to-page POC runs and the imported owner run is visible.
The original two-friend v1 is not complete: field validation remains, and some
promised features are still absent. Counting packets or passing tests would not yield an honest
completion percentage.

| Packet | Implemented and evidenced | Still needed for its full acceptance |
|---|---|---|
| WP-001 / baseline | Imported, independently reviewed and merged; deployed application self-checked | Full deployment was not independently rerun |
| WP-002 / two drivers | Integrated two listeners, isolated trackers, migration and attribution; repaired configuration/source handling independently re-checked | Two real drivers and internet delivery validation in WP-003; inherited reordered UDP can duplicate laps |
| WP-003 / deploy and captures | One confirmed Rivals capture imported without raw-byte changes; reviewed gateway deployed; browser pages/WebSocket and protected mutations checked; both ports receive external race-off probes | Fresh game captures from each driver; event matrix, internet timing and free-roam/storage measurements; generic upstream browser update check removal (disabled in this deployment) |
| WP-004 / rivalry | Recorded route/class attempts, driver/car/PI labels, candidate bests and exploratory comparison; session event guesses and source-address redaction | Quality/timing provenance fully propagated into rivalry records; event-mode/equivalence evidence; ranked rules, scoring and dated record history |
| WP-005 / corners | API wired into the app; measurements, trace links and comparison warnings; synthetic checks and one real trace | Persist a stable reference/numbering; verify direction and sensible boundaries; two real laps/cross-car alignment; forward clock discontinuities |
| WP-006 / summary | Comparison page with overlays and largest corner differences; optional two-driver Live cards/detail independently browser-tested and deployed | Complete route summary and selected-lap analysis links; per-driver/total storage display; real two-driver comparison/live field use |

The pre-#19 review cleanup corrects WP-002/004/005's stale integration
checkpoints, records public-read scope in DESIGN/ADR 23, and fixes Live card
accessible names. The advisory packet checker accepts an explicit reason for
a trivial packet-free change. These repairs do not complete the field matrix,
rankings/history, stable corner reference or summary/storage work above.

### Next useful finish line: unattended use by both drivers

This is a smaller proposed finish line within v1, not a claim that the
remaining v1 criteria have been removed.

1. **Integrated POC and prefix slice: merged.** PR #10 supplied the runnable
   build and first-start repair. PR #13 adds relative URLs with independent
   app routing checks and green CI. Their remaining field/deployment limits
   stay in the packet; integration is no longer an outstanding step.
2. **Shared installation: deployed and checked.** The real prefix, browser
   WebSocket, gateway mutation protection, driver labels and imported game
   recording are checked. No seeded examples were imported. Two external
   race-off packets prove listener reachability, not game detection/timing.
3. **Prove asynchronous use by both friends.** Each configures Data Out once,
   drives without server intervention, and sees their own event on the shared
   site. Compare two real laps on a candidate shared route with accurate game
   timing and honest quality/unknown labels. Keep comparisons exploratory
   while direction, event rules or timing equivalence remain unverified.

Finish the original v1 by completing the WP-003 event/measurement matrix,
recognized zero-completed-lap attempt retention, quality/provenance integration,
stable corners, route summary/storage monitoring and bounded receive/storage
handling. Ranked rivalry and history follow the required rules and equivalence
evidence; they are not silently counted as delivered by candidate bests.

Use the existing packet acceptance criteria as the checklist. For every
remaining criterion record whether code is missing, self-tested only,
independently checked, or admitted; keep a locator for its evidence. The next
action is the first unresolved criterion on this path, not merely the first
packet whose status is not `complete`.

Real captures should validate detection as early as practical, but a basic
read-only rivalry UI may be built and tested against clearly labelled
simulated recordings before the complete real-world capture matrix is
available. Report unverified real-world behaviour rather than blocking POC
progress on two humans' availability.

## Risks

| # | Risk | Check | When |
|---|---|---|---|
| R1 | Upstream timing logic assumes a LAN. Internet jitter, loss and reordering may upset arrival-time rules (15 s silence, clock-freeze finish, airborne duration). | Compare a session recorded over the internet with the same drive recorded locally, or replay with injected loss | M2 |
| R2 | Free-roam frames are written every second and deleted at session close. Long free roam means heavy write-then-delete churn and a database file that does not shrink without vacuum. | Measure file size before and after 30 minutes of free roam. If it matters, hold frames in memory until event evidence appears. | M2 |
| R3 | Both drivers are on PC, where packet rate follows frame rate (reports of 128–140/s). Storage and write load are two to three times the 60/s figure. | Record each driver's observed rate | M2 |
| R4 | A game update changes the packet. | Wrong-size counter visible on a status page | M1 |
| R5 | Upstream moves on and our copy drifts. | Keep edits to upstream files small; record syncs in UPSTREAM.md | Ongoing |
| R6 | Corner boundaries differ between cars or lines, so numbering is unstable. | Derive corners once per route from a reference lap, not per lap | M4 |
| R7 | Serving under a URL prefix touches upstream frontend files, which works against R5. | Keep URLs relative; PR #13 adds a regression guard; review later upstream diffs | M2 |
| R9 | Collector and web are two writers on one SQLite file (ADR 24). A web-side reprocess or import can delay the start of a session that begins during it. | Simulator drive started during a long reprocess; watch `write_error` and `frames_dropped` in `/api/status` | Before the split is deployed |
| R8 | Inside a container the app may see Docker's bridge address instead of the driver's IP. | Check the logged source address on the first real packets | M2 |

## Deferred

| Item | Why deferred |
|---|---|
| CSV import | No defined format; raw replay covers testing (ADR 8) |
| Free-roam recording | Storage; not wanted (ADR 7) |
| VPN or home collector | Not needed for two friends (ADR 5) |
| In-app accounts | The web server in front handles access (ADR 6) |
| Live dashboard beyond watching | Not part of the after-the-fact purpose. The page is kept as an optional spectator view for both drivers (ADR 22); live standings or a live comparison between drivers are not planned |
| Shared-segment comparison across different routes | Later idea from the concept |
| Weekly challenges or other rivalry formats | Decide after using the basic records table |
| Retention limits beyond upstream's delete | Storage is modest with events only |
| More than two drivers | Design allows it; untested |

## Open questions

For the owner.

1. **Ranking defaults in ADR 10.** Until confirmed, implement them as
   reversible, labelled defaults; no unsupported cross-mode winner claims.
2. **Licence for SplitTime itself** if the repo is ever made public. Default:
   MIT, to match upstream.
3. **May an agent push to GitHub, or only commit locally?** Default: local
   commits only.
4. **Ports.** Default 9999 and 10000.
5. **Who verifies packets?** The method wants a verifier other than the
   worker: a second agent, or the owner.

Answered on 2026-10-12: web server and access (the existing gateway, ADR 17);
platform (both PC); server (this host, direct UDP, ADR 5); run mode
(container, ADR 15).

## Findings

### Compact Rivalry workspace, 2026-10-12

Rivalry v2 adds dense route/class rows, recorded gaps, searchable finish-dated
history, real outlines and explicit A/B selection alongside the original.
It retains exploratory timing/validity limits; competitive scoring and real
two-driver equivalence remain open. WP-004 records verification and the
deployment checkpoint. The [merge UX review](MERGE_RUNS_UX_REVIEW.md) identifies
grouping terminology, implicit sitting selection and inconsistent best labels
as the next bounded usability change, with no grouping changes in this slice.

### Shared deployment checkpoint, 2026-10-12

The reviewed deployment now serves the imported owner's 2:30.808 Rivals attempt
with contact only and no seeded sessions. Original recordings were untouched;
new live storage was seeded from a corrected copy. Ordered raw-packet hashes
match across the original export, staging and live seed (16,333 frames).
Codex reviewed the gateway preparation and performed live deployment
self-checks: prefixed pages/API, browser WebSocket, public reads/protected
mutations, both external UDP counters and unchanged unrelated containers.
A separate agent source-reviewed the final Origin protection and seed/probe
instructions without blockers; it did not independently rerun deployment.
See [WP-003](../work/WP-003-deploy-and-real-captures.md) and the hosting record
for exact checks, receipt and remaining criteria.

R1 remains unmeasured: the original recording was local and the new external
packets were race-off reachability probes. R2's 30-minute free-roam/storage
measurement and R3's observed rates for both drivers remain pending. Next:
one fresh real event from each driver before extra rivalry/history work.

### Real capture and final integration checkpoint, 2026-10-12

PR #10 is the single integration route to main. Opus merged corner fix `c29fdcc`
at `7c81323`, preserving driver attribution; independently re-ran 18/19 adverse
tests successfully. The inherited out-of-order lap-duplication test remains a
known limit. PR #8 process documentation is reconciled into this branch.

The owner confirmed one real Rivals lap, no rewind, with wall contact. A local
snapshot holds 16,333 frames; stored 150.807556 s matches both game lap-time
fields. A negative-distance approach and first-line lap-clock reset caused a
false rewind. Repair `175bffe` re-anchors that observed first-start signature
without changing any detector threshold. Separate replay copies retain contact
and the game time, remove false rewind/clock warnings; live data stays intact.
Corrected timed trace: 14,187 samples, continuous, zero gaps, 12 detected corners,
metres_per_unit 1.16881; direction and corner accuracy remain unverified.

Own checks: 223 Python tests, 12 Node UI tests, Ruff and packet round trip pass.
UI repair `f09c3ec` follows configured A/B order, explains unresolved equivalence
and clock warnings, and makes chart axes readable on narrow screens. Opus's
[independent review of `f68d70a`](https://github.com/adrianhensler/splittime/pull/10#pullrequestreview-5490170368)
re-ran 223 Python and 12 Node tests and found no blockers. One hypothetical
safe-direction miss remains: a lap-clock reset one frame after crossing may
still flag a clean lap suspect. No capture supports widening that predicate.
Current live recording retains
its original index until deliberate curation or reprocessing; only copies were replayed.

Next: verify later process/checkpoint changes and make PR #10 ready; do not close source
PRs until integration succeeds. Then verify URL-prefix/gateway/Docker setup and
capture the second driver. Route equivalence, official validity, cross-car
alignment and the complete event matrix remain open. Defer rivalry history and
extra analysis until this capture-to-page path is in ordinary use.

### Initial integrated local POC checkpoint, 2026-10-12

Branch `feat/codex-integrated-poc` combines the two-driver backend, rivalry API,
rivalry page and isolated corner module. Corner endpoints are now registered in
the app; candidate records link to a read-only comparison page with speed,
throttle and brake overlays, timing/quality labels and corner measurements.
The corner response attributes A/B to driver names; no winner is awarded.

Validation on Windows/Python 3.13: full combined suite 205 passed; Node UI
controllers 8 passed; Ruff passed. After adding driver labels to the corner
response, its regressions are run separately. Browser smoke check followed
Rivalry to the comparison page with two simulated drivers. This is synthetic
validation, not field accuracy or deployment acceptance.

`scripts/seed_demo.py <new-directory>` creates a fresh simulator-only database,
refusing to overwrite an existing one. Run offline with the printed driver
configuration, HTTP bound to 127.0.0.1:8100, UDP 19999/20000.

Remaining: review/integrate pending PRs; real FH6 recordings; verified gateway
and URL-prefix deployment; zero-completed-lap attempt retention; bounded storage
and per-driver storage totals; durable corner numbering/reference; rivalry
history and competitive-equivalence evidence. No VPS runtime or gateway was
changed at this checkpoint.

Record what real captures show here, dated, as WP-003 produces them.
