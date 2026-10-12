# Build plan

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

"On `main`" below records only what has merged, and is updated by the pull
request that merges it. Work in progress and in review is in the
[pull request list](https://github.com/adrianhensler/splittime/pulls?q=is%3Apr);
it is not tracked here, because a finer-grained table went stale within an
hour of parallel work starting. The next slice is the first milestone not on
`main`, subject to the open pull requests.

| Milestone | Packet | On `main` |
|---|---|---|
| Planning docs | [WP-000](../work/WP-000-planning.md) | yes |
| M0 Import baseline | [WP-001](../work/WP-001-import-baseline.md) | yes (PR #4, `ad4551b`) |
| M1 Two drivers | [WP-002](../work/WP-002-two-drivers.md) | no |
| M2 Deploy and real captures | [WP-003](../work/WP-003-deploy-and-real-captures.md) | no |
| M3 Rivalry views | [WP-004](../work/WP-004-rivalry-views.md) | no |
| M4 Corner comparison | [WP-005](../work/WP-005-corner-comparison.md) | no |
| M5 Summary page and polish | [WP-006](../work/WP-006-summary-page.md) | no |

## Milestones in one line each

- **M0** LapScope imported unchanged at `c39a8d9`, trimmed, tests passing.
- **M1** One listener and tracker per driver; sessions attributed by port.
- **M2** Works under a URL prefix; deployed; both drivers record real events;
  risks R1 to R3 measured.
- **M3** Driver labels, records per route and class, rivalry score, ranked
  versus exploratory.
- **M4** Fixed numbered corners per route; two-lap corner table.
- **M5** One summary page per route; storage display.

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
| R7 | Serving under a URL prefix touches many upstream frontend files, which works against R5. | Route every request through one helper; measure the diff size | M2 |
| R8 | Inside a container the app may see Docker's bridge address instead of the driver's IP. | Check the logged source address on the first real packets | M2 |

## Deferred

| Item | Why deferred |
|---|---|
| CSV import | No defined format; raw replay covers testing (ADR 8) |
| Free-roam recording | Storage; not wanted (ADR 7) |
| VPN or home collector | Not needed for two friends (ADR 5) |
| In-app accounts | The web server in front handles access (ADR 6) |
| Live dashboard | Not part of the after-the-fact purpose; upstream's stays in place unless it gets in the way |
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
and clock warnings, and makes chart axes readable on narrow screens. New
recorder/UI changes still need independent review. Current live recording retains
its original index until deliberate curation or reprocessing; only copies were replayed.

Next: review the new integration head and make PR #10 ready; do not close source
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
