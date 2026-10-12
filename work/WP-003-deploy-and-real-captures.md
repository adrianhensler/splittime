# WP-003: Deploy and real captures (M2)

| | |
|---|---|
| Status | partial; shared deployment checked, one imported real capture visible; fresh two-driver captures and field matrix remain |
| Parent | WP-000 |
| Children | none |
| Worker | Codex (checkpoint owner); Opus contributed prefix and gateway configuration |
| Verifier | owner supplied capture ground truth; Opus reviewed repair and final gateway changes; Codex reviewed prefix/gateway work and ran deployment self-checks |
| Acceptor | owner |

## Intent

Put the two-driver recorder where both drivers' games can reach it, and find
out how the upstream detection behaves on real internet traffic before
building on it.

## Outcome

The app runs behind a reverse proxy under a URL prefix, both drivers record
real events unattended, and the two main risks are measured.

## Authority and limits

- May: make the app work under a URL prefix; remove the browser
  update check; add configuration for bind address and allowed host; write
  deployment files in this repo.
- Original scope excluded gateway changes. The owner subsequently explicitly
  requested completion of the gateway deployment and public projects-page
  access (2026-10-12). This checkpoint records that authorized deployment;
  it does not grant authority for unrelated host changes.
- May not: use sudo/run as root, change unrelated services, or make broad
  firewall changes. None were needed for this deployment.
- Real recordings are data. Copy them for analysis; never edit or delete them.

## Acceptance criteria

1. Every page, API call and WebSocket works through a proxy that strips its
   configured prefix; root hosting still works. No application prefix setting
   is needed; the bare prefix redirects to its trailing-slash URL.
2. The browser makes no request to GitHub.
3. `docs/hosting/test-hensler-work.md` and `docs/SETUP.md` match what was
   actually run, including every correction found on the way.
4. Both drivers have recorded events on different days without touching the
   server (acceptance check 1).
5. Between them the drivers have captured: a circuit race, a Rivals session, a
   sprint, a race quit mid-way, a rewind, and 30 minutes of free roam.
6. A written finding on R1 (timing over the internet) in `docs/BUILD_PLAN.md`,
   with the captures it rests on.
7. A written finding on R2 (free-roam churn): database size before and after,
   and no stored session (acceptance check 7).
8. Each driver's observed packet rate is recorded (R3).

## Context

- `docs/hosting/test-hensler-work.md`, `docs/SETUP.md`, `docs/GAME_SETUP.md`
- `docs/ADR.md` entries 5, 6, 15, 16, 17
- `docs/BUILD_PLAN.md` risks R1 to R3, R7

## Claims

Deployment is checked; the original local recording and reachability probes
do not prove fresh two-driver recording or the full field matrix.

| # | Claim | Basis |
|---|---|---|
| C1 | One confirmed Rivals run has exact game lap timing; copied replay removes false rewind | E1; Codex inspection and owner ground truth |
| C2 | Shared deployment serves the imported owner run; both UDP ports receive external packets | E4; Codex deployment self-checks and browser/UDP receipts |
| C3 | Relative URLs work through the real gateway; public reads and protected changes are checked | E3, E4; prefix review, disposable gateway checks, live browser/API probes |
| C4 | Fresh real recordings from both drivers and the full event/measurement matrix remain unproven | E2; external probes were race-off packets, not game events |

## Evidence

| ID | What | Where |
|---|---|---|
| E1 | Capture/replay findings and scope | [Capture record](https://github.com/adrianhensler/splittime/pull/10#issuecomment-6118975642); `docs/BUILD_PLAN.md` dated checkpoint |
| E2 | Outstanding field checks and generic update-check removal | This packet's acceptance criteria and `docs/hosting/test-hensler-work.md` |
| E3 | Prefix implementation, author Docker/browser checks and independent URL/ASGI routing checks | [PR #13](https://github.com/adrianhensler/splittime/pull/13), reviewed head `982b54f`, merged at `d096489` |
| E4 | Deployment receipt, reviewed configuration, live UI/WebSocket, write protection, external UDP and preservation checks | [Gateway PR #113 receipt](https://github.com/adrianhensler/test.hensler.work/pull/113#issuecomment-6126431312); [hosting record](../docs/hosting/test-hensler-work.md); SplitTime runtime `1e51eb9`, gateway `b950101` |
| E5 | Two-driver Live UI reviewed and deployed; both public sockets receive external race-off probes without recording changes | [PR #17 receipt](https://github.com/adrianhensler/splittime/pull/17#issuecomment-6127181182); runtime `bc5f836`, reviewed head `c39ea19` |

Raw recordings remain in private data directories; no packets, coordinates or
database are in Git. Viewing is public at the owner's direction; management
requires the gateway's service grant and exact expected Origin.

## Known, unknown, unproven

- **Known:** PR #13 replaces absolute URLs with relative URLs. Root and
  prefixed app routing were independently checked; the real gateway now serves
  Live, Analysis, Rivalry and Compare, and the browser WebSocket connects.
- **Known for this local run:** 16,333 frames; 150.807556 s agrees exactly
  with game LastLap/BestLap; owner confirms Rivals, contact and no rewind.
  Copied replay after `175bffe` retains time/contact and removes the false
  first-start rewind. Corrected timed trace has zero timestamp gaps.
- **Known:** the imported run is attributed to Captn Compass and displayed as
  2:30.808 with contact only. Raw bytes match the original export. The incomplete
  subsequent lap is retained. No seeded demo sessions were imported.
- **Known:** each configured listener received one valid 324-byte race-off
  packet from the owner's workstation. No sessions or frames were added.
- **Unknown:** internet game timing/loss/reordering, second-driver rate and events, real rewind,
  sprint/race/abandonment cases, and measured free-roam/storage behaviour.

## Unresolved

- Both drivers need to drive fresh events using their assigned ports.
- Complete criteria 4-8 incrementally; no reachability probe substitutes for
  real captures. The generic upstream browser update check remains code to
  remove; the deployed instance disables it with `LS_OFFLINE=1`.

## Checkpoint

Initial deployment, 2026-10-12: SplitTime runtime `1e51eb9` was deployed behind the gateway from
reviewed PR #113 (`369afd3`, merged as `b950101`). PR #112 was closed as
superseded. The owner run is visible on the public Rivalry page; source data
was preserved and a separate corrected copy seeded a new database without
overwriting existing data. Full paths, mapping and repeatable read checks are
in `docs/hosting/test-hensler-work.md`. This documentation checkpoint is
[PR #16](https://github.com/adrianhensler/splittime/pull/16), based on `1e51eb9`;
it changes no application code and does not admit unresolved field criteria.

2026-10-12, Opus 5.5 (`feat/url-prefix`): every page now uses relative URLs,
checked through a prefix-stripping proxy; the container builds and records two
simulated drivers on test ports. Results and what was not checked are in
`docs/hosting/test-hensler-work.md`. The gateway was untouched by this slice.

Codex independently reviewed `982b54f`: 13 local UI tests passed; the actual
dashboard socket constructor selected correct root, HTTPS and nested-prefix
URLs. An in-process prefix-stripping ASGI probe fetched the entry pages,
linked assets and version API, then accepted a same-origin WebSocket and
delivered a JSON frame at root, `/splittime/` and `/nested/splittime/`.
These checks did not run the real gateway or its HTTP upgrade/authentication.

Next: each driver enables Data Out with the assigned destination and drives
one fresh event, then checks attribution and game timing on the site. Collect
the remaining event/measurement matrix incrementally. Do not replay or edit
the live data directory. Use the hosting record's settings for game setup;
the Live page shows feeds and no setup address/port.

2026-10-12, Opus 5.5 (`feat/two-driver-live`): the Live page no longer shows
setup text, an address or a port, and subscribes to each driver's feed
separately (see WP-006). The deployed site now runs the reviewed replacement
from PR #17 at `bc5f836`. Codex's
independent code/browser review and live deployment receipt are E5. Each public
card received the external diagnostic stream; the original 16,333 frames,
lap values/contact and ordered raw hash are unchanged. Both real trackers were
idle before the targeted restart. Two real drivers live at the same time have
not been observed, and the original field matrix remains outstanding.

## Verification

Opus independently reviewed the code repair at `f68d70a`, but did not see the
private capture. Packet/replay claims rest on Codex inspection and owner ground
truth. Codex independently checked the prefix application slice at `982b54f`;
the container/browser smoke results in PR #13 are Opus's self-checks.
Codex reviewed Opus's gateway preparation and performed the live deployment
self-checks: four prefixed pages, API attribution/time/redaction, public reads,
anonymous write denial and invalid-Origin denial, browser WebSocket, both
external UDP counters, raw-byte preservation and unchanged unrelated container
identities. Opus separately reviewed the final Origin gate and seed/probe
instructions without blockers; this was source review, not an independent
rerun of the whole deployment. Gateway API tests passed (77); the actual route
was exercised in a disposable non-root Caddy container before deployment.
Second-driver real capture and the full matrix remain unverified.

## Acceptance

Reviewed deployment slice merged and deployed under the owner's authority.
This packet remains partial; docs-only merging does not admit its unresolved
field criteria or declare the original v1 complete.

## PR #19 field finding: Rivals post-finish hold (2026-10-12, Opus 5.5)

From the owner's first four live Rivals runs. After a timed lap the game holds
the car at the line for about 20 s (LapNumber 1, speed 0 from the first frame,
a 196 m/s² spike), then resets it to the start (LapNumber 0) until the race
clock restarts. The recorder stored both stretches as incomplete laps, the
first flagged `contact`.

[PR #19](https://github.com/adrianhensler/splittime/pull/19) adds
`_drop_parked_lap` in `app/recorder/laps.py`. As first pushed (`aefc1ba`,
`560aa52`) it deleted any untimed lap after a timed one that moved under 25
odometer units and never reached 5 m/s. Independent review showed that this
also deletes a real attempt abandoned slowly at the line (2 s at 1.0, 4.0 or
4.99 m/s). Repaired on top of `560aa52`: movement and speed are now necessary
but never sufficient. A lap is deleted only when it is one of:

- **The hold:** opened by a `LapNumber` increment that posted a lap time,
  **and** a ground-plane spike of at least `IMPACT_PEAK` (98 m/s², upstream's
  existing constant; 196 observed) landed in it, **and** it never moved 25
  units or reached 5 m/s.
- **The wait at the start:** the lap a recognized hold handed over to, when
  `LapNumber` fell and the odometer hard-reset in the same frame (upstream's
  existing `POINT_FINISH_DIST` / `WTA_DIST_COLLAPSE` test), it stayed within
  the same 25 units / 5 m/s, and the race clock has not restarted.

Everything else after a timed lap is kept as an incomplete attempt: slow,
short or stationary without the halt spike, however it ends (telemetry end,
game reset, race-clock restart). The stretch after such an attempt is kept
too. No upstream threshold changed; timed laps and raw frames are untouched.

| Evidence | Re-run |
|---|---|
| 24 tests: the captured hold and reset signature; the reviewer's short (10, 24, 26 units) and slow (0, 1.0, 4.0, 4.99 m/s) attempts kept at telemetry end, game reset and clock restart; a line crossing that carries on; frame count unchanged by a drop. 12 of them fail on `560aa52` | `pytest -q tests/test_rivals_finish.py` |
| At `560aa52`, before the repair, by the first author: replay of a read-only copy of sessions 5, 8, 11, 14 gave 11 laps → 4; times 150.808 / 74.654 / 68.712 / 51.308 and the Highway lap's `contact` unchanged; 43,283 frames untouched | `reprocess_session` on a copy, never the live directory |

**Not re-run after the repair:** the replay above. The repair was made
without access to the captures, from the scalar signature recorded here. It
deletes a subset of what `560aa52` deleted, so it cannot remove more from
those sessions; whether it still removes all seven extra laps depends on
every real hold carrying a spike of 98 m/s² or more inside the hold lap and
on the counter and odometer resetting in the same frame. If either differs,
the extra laps stay (visible, untimed) rather than a real attempt being lost.
Replay a copy before relying on the 11 → 4 figure.

Other limits. One test's input changed: the creep-speed hold test now sends
the 196 m/s² halt spike that every captured hold had; the same creep without
the spike is a new test and is kept. A hold lap whose halt spike was missed
or under 98 m/s² is kept as an untimed, possibly `contact`-flagged lap.
Unknown: whether a second Rivals lap can run on without the hold; a driven
lap is kept and would carry the spike's `contact` flag. Four captures from
one driver on one day are not the event matrix. Stored live sessions are not
changed by the merge; reprocessing them is a separate, owner-authorised step
that renumbers their lap ids.
