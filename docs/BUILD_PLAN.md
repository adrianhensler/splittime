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

| Milestone | Packet | State |
|---|---|---|
| Planning docs | [WP-000](../work/WP-000-planning.md) | Complete, awaiting acceptance |
| M0 Import baseline | [WP-001](../work/WP-001-import-baseline.md) | Complete, in review (branch `feat/opus-lapscope-baseline`) |
| M1 Two drivers | [WP-002](../work/WP-002-two-drivers.md) | In progress — GPT-6 feature branch; tests pending |
| M2 Deploy and real captures | [WP-003](../work/WP-003-deploy-and-real-captures.md) | Draft |
| M3 Rivalry views | [WP-004](../work/WP-004-rivalry-views.md) | Draft |
| M4 Corner comparison | [WP-005](../work/WP-005-corner-comparison.md) | Draft |
| M5 Summary page and polish | [WP-006](../work/WP-006-summary-page.md) | Draft |

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

Record what real captures show here, dated, as WP-003 produces them.
