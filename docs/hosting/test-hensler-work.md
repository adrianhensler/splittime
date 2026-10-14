# Reference deployment: test.hensler.work

## Session debrief web update, 2026-10-13

Independent reviewer GPT-6 Astra merged SplitTime PR #37 at `2e325f5` (green
CI) and site PR #120 at `9fda383` (Compose validated; no site CI). Deployed
2026-10-14T02:55Z as adrian via pinned SSH; rebuilt/recreated only `splittime`
with `--no-deps`. No provider provisioning, gateway/collector restart or raw
recording modification. Existing private key is valid and present in web only.

Online SQLite integrity-checked backup, old Compose and deployment receipt:
`/home/adrian/splittime-deploy-backups/session-debrief-20261014T025513Z/`.
Rollback image: `splittime-web-rollback:20261014t025513z`. Collector retained
ID `0dd85fa2e483...` and start `2026-10-13T21:10:42.085846346Z`; all 29 other
containers unchanged. Hash of the 17 closed sessions/laps/edits/raw frames:
`3a8c10e965dc3bc96aed1e33eff9025c7eec78f98f904d95dc5c4c8cd00ddad0`, unchanged.

Live browser shows actual debrief measurements under Rivalry. Public GET 200;
missing/cross-origin POST 403, valid-origin anonymous POST 302 to login. Browser
generation error preserves measurements and offers reload. Server key-validity
read succeeds; separate `debrief.db` integrity ok and zero live calls. Actual
signed-in live inference remains untested. Extra internal operator smoke call
was rejected by automatic approval review because it bypassed the external
login; it was not executed. Real synthetic provider/browser checks passed.

Keep `debrief.db` across deployment/rollback and back it up online separately;
weekly telemetry backup does not yet include it. Do not restore an older ledger
with AI enabled in the same UTC month. Inference is explicit, anonymous and
bounded to $1/UTC month, with $0.01/call reserved before sending.

This is the owner's personal hosting. The generic guide is
[../SETUP.md](../SETUP.md). This record describes the deployment checked on
2026-10-12; it replaces the earlier unexecuted gateway plan.

## Running installation

- Public site: <https://test.hensler.work/splittime/rivalry.html>, also linked
  from the public projects page.
- SplitTime runtime: `a669985ecad61e1bd942eaf744536cb4938a51ea` (#19). Earlier:
  `bc5f836` (#17), and `1e51eb9` (#15) for the initial deployment.
- Gateway deployment: `b950101ea36d39295740917280f71ddcec472bb8`, from reviewed
  [PR #113](https://github.com/adrianhensler/test.hensler.work/pull/113).
  #112 is closed as superseded. #111's footer removal is also deployed.
- Gateway checkout: `/opt/prod/test.hensler.work`; dedicated runtime checkout:
  `/home/adrian/splittime-runtime`; container: `test-splittime`.
- Data bind mount: `/home/adrian/splittime-data:/app/data`, owned by `adrian`.
  The application runs as UID/GID `1001:1001`. HTTP 8000 stays on the Compose
  network; only UDP 9999 and 10000 are published.
- `LS_OFFLINE=1` disables optional catalogue/update requests in this installation.

The authoritative deployment configuration and operational commands are in
[the gateway's deployment guide](https://github.com/adrianhensler/test.hensler.work/blob/main/docs/splittime-deployment.md).
Use that reviewed configuration rather than the obsolete root-container,
shared named-volume or all-path login snippets from the initial plan.

## Driver setup

Enable **Data Out** in the game and enter:

| Driver | Permanent ID | Destination IP | UDP port |
|---|---|---|---|
| Captn Compass | `captn-compass` | `167.88.46.12` | **10000** |
| FishFighterNS | `fishfighterns` | `167.88.46.12` | **9999** |

The hostname resolves through Cloudflare. Game UDP goes directly to the VPS
IP; it does not travel through the HTTP tunnel. The assigned destination port
identifies the driver, not the sender IP. UDP is not authenticated.

The [deployed Live page](https://test.hensler.work/splittime/) has a card for
each driver and no setup address/port. Both cards update concurrently; selecting
one shows that driver's detailed gauges, map and input trace. Waiting and paused
feeds leave the controls usable. Game setup remains the table above.

## Viewing and management

The owner explicitly requested public projects-page access on 2026-10-12.
GET/HEAD and browser WebSocket viewing are public. Every other HTTP method
requires both:

1. The exact `Origin: https://test.hensler.work`.
2. The existing gateway login and `splittime` service grant.

Missing, null, sibling, foreign, wrong-scheme and lookalike Origins return 403
before authentication or application handling. Anonymous requests with the
expected Origin redirect to login. The public card grants no management access.
Responses are `Cache-Control: no-store`; the bare `/splittime` redirects with
308 to `/splittime/`. Caddy strips the prefix inside an explicitly ordered route.

## Import and data preservation

A corrected copy of the owner's local session 5 seeded a new database via
SQLite online backup, with exclusive first-file reservation and no overwrite:

- Live database: `/home/adrian/splittime-data/telemetry.db`.
- Staged source: `/home/adrian/splittime-import/staged-for-deploy/telemetry.db`.
- Original export remains in
  `/home/adrian/splittime-import/captn-compass-20261012-session5/`.
- One real session, 16,333 original 324-byte packets; simulated sessions excluded.
- Completed lap: 150.80755615234375 s (**2:30.808**), contact only; the owner
  confirmed Rivals and no rewind. The subsequent unfinished lap is retained.
- Original export, corrected staging and new live seed have the same ordered
  raw-packet SHA256:
  `b8c8b21703827913ce1b33f58635e2337134465b9423eef352d400468e2dce09`.

The run appears under **Inspect attempts and missing evidence**. Wall contact
keeps it out of clean candidate bests. The displayed mode is a heuristic
("probably Rivals"), not an official packet field. No raw recording is in Git.

## What was checked

[Deployment receipt](https://github.com/adrianhensler/test.hensler.work/pull/113#issuecomment-6126431312).
Codex reviewed the gateway preparation and performed these deployment self-checks:

| Check | Observed result |
|---|---|
| Real prefixed pages/API | Live, Analysis, Rivalry and Compare return 200; imported name/time visible; sender address absent from public API |
| Browser through Cloudflare/Caddy | Rivalry shows imported attempts; Live WebSocket connected; projects card opens the site |
| Mutation boundary | Anonymous expected-Origin writes redirect to login; invalid/missing Origin writes return 403; nonexistent-ID probes do not alter data |
| External UDP | One valid race-off packet sent from the owner's workstation to each port; each configured listener counter increments to 1 |
| Recording preservation | Probes add no sessions/frames; still one session and 16,333 frames with unchanged lap values |
| Runtime isolation | UID/GID 1001; HTTP internal only; unrelated container identities, including photography, unchanged |
| Reviewed gateway | 77 API tests pass in fresh disposable non-root image; actual Caddy route tested with auth/app stubs; separate source review of final Origin gate/seed/probe instructions found no blockers |

Only the auth API was recreated; Caddy was hot-reloaded as UID 1001 with the
configuration on stdin. No sudo/root helper or broad firewall change was used.
An old API image tag was retained for rollback. Existing source checkouts and
original captures were preserved.

The private deployment command/result records are under
`/home/adrian/splittime-import/deploy-control-20261012-01/`, including
`live-deploy-status.json`, `live-deploy-commands.log` and
`containers-before-deploy.json`. These are receipts, not scripts to rerun over
an existing data directory. Read-only rechecks include:

```sh
docker compose ps splittime
docker inspect --format '{{.Config.User}} {{json .HostConfig.PortBindings}}' test-splittime
```

Visit the public Rivalry/Live/projects pages in a browser. Scripted Python HTTP
was rejected by Cloudflare's browser integrity check (1010); no protection was
changed to accommodate the probe. External UDP receipt was read through trusted
SSH loopback API checks instead. Browser access and game UDP are separate paths.

## Live-view deployment follow-up, 2026-10-12

[PR #17 deployment receipt](https://github.com/adrianhensler/splittime/pull/17#issuecomment-6127181182).
Codex independently reviewed `c39ea19`, ran 43 Node tests, rechecked all three
reproduced recovery defects, and merged with test/ui/records CI green. The
unchanged Python source had 17 targeted tests pass locally. In a disposable
UID/GID-1001 container with synthetic-only tmpfs storage, the actual browser
showed two racing streams, detail switching, one-driver pause isolation,
empty canvases and resumed feeds after Back; no browser errors were observed.

Only SplitTime was rebuilt/recreated, with both real trackers idle beforehand.
The gateway was unchanged. Live self-checks retained driver configuration,
non-root/internal-HTTP settings, missing/sibling-Origin 403 and anonymous
expected-Origin 302, unrelated container identities and the original database
snapshot/hash. Both public browser cards showed receiving during a 20-second
external race-off probe: 596 packets per listener, no new sessions or frames.
These were diagnostic packets, not game recordings or internet timing evidence.
Command/status receipts are under
`/home/adrian/splittime-import/live-deployment-20261012/`; rollback image:
`testhenslerwork-splittime:pre-live-20261012`.

## PR #19 deployment and reprocess, 2026-10-12

[Receipt](https://github.com/adrianhensler/splittime/pull/19#issuecomment-6129168560).
Runtime moved from `bc5f836` to `a669985` (#19) with the gateway guide's
*Updating SplitTime* steps: online backup first
(`/home/adrian/splittime-data/telemetry.db.bak-20261012T172146Z`), rollback
image `testhenslerwork-splittime:pre-pr19-20261012`, only `splittime` recreated
with both trackers idle. Gateway unchanged.

On the owner's instruction, sessions 5, 8, 11 and 14 were then reprocessed
through the app's own endpoint from inside the container. 11 laps became 4:
each session keeps its timed lap (150.808 with `contact`, 74.654, 68.712,
51.308) and loses the post-finish hold and wait. New lap ids are 12 to 15; ids
1 to 11 are gone. 43,283 frames unchanged, integrity ok. Opus 5.5 self-checks;
the pages were not opened in a real browser afterwards.

## Rivalry v2 web-only deployment, 2026-10-13

After independent GPT-6 Astra review and green CI, SplitTime PR #23 merged at
`046185c87807916daa948f98692695847226bc28`; the projects-card PR #117 merged at
`45e478c802cf4026df344797b03cb707fa8088c3`. Runtime checkouts now use those
commits. Direct pinned SSH as `adrian` updated the existing web service with
`docker compose build splittime` and `up -d --no-deps splittime`. No Hostinger
provider write, new VPS, remote Claude invocation, gateway/firewall change,
collector restart or unrelated service restart was involved.

Collector container `ff4025d5b729` retained its start time
`2026-10-12T19:57:53.327322348Z`; 29 other running containers retained their IDs.
Ordered raw frames and session/lap/edit rows from the eight already-closed
sessions hash identically before/after. An online SQLite backup and gallery
copy were saved under
`/home/adrian/splittime-deploy-backups/rivalry-v2-20261013T025931Z/`, alongside
`receipt.json`. Existing web image retained as
`splittime-web-rollback:20261013t025931z`. Recordings were not edited/reprocessed.
The existing untracked `bees-session-transcript.md` was preserved.

Live browser self-checks saw both projects cards, four route/class rows with
11 real attempts, captured outlines, local-date search, improvements filter
and explicit A/B selection. Comparison 20/18 loaded recorded traces and corner
rows at the prefixed URL, with the exploratory labels intact. The original
Rivalry source remains unchanged. Back-navigation view-state repair is tracked
separately in WP-004; real two-driver field checks remain open.

## Remaining field checks

The reachability/race-off probes were not game recordings. Each driver next sends
one fresh real event, verifies attribution/game time, and later records on a
different day without server intervention. The friend's own network is untested.
Complete WP-003's circuit/Rivals/sprint/quit/rewind/free-roam matrix, observed
packet rates, internet jitter/loss/timing comparison and storage-churn measurement.
Source-address evidence may show Docker's bridge rather than the game sender;
identity remains by port. Direction, official validity and cross-car equivalence
are unproven. Scheduled backups/retention monitoring are not installed by this
slice. Do not edit or replay recordings in the live data directory.

## Fault register, 2026-10-13

The recordings on this installation behind the faults listed on the site's
"How it works" page (`app/static/how-it-works.html`, section 12). That page is
shipped with the software and names no session; this table does. The database
held 17 sessions and 8 routes when it was written.

| Fault | Recording here | State here |
|---|---|---|
| F1 run deleted | Session 50, FishFighterNS, 2026-10-13 12:37 UTC, 155 s, odometer +5952 | Fixed in #26. The run is gone |
| F2 circuit split in two | Sessions 38 and 40 on route 7 (Shimanoyama Circuit, length 5945); session 41 on route 8 (length 6275) | Fixed in #31. At the owner's request session 41 was reprocessed onto route 7 and the empty route 8 row deleted, 2026-10-13 |
| F3 abandoned run timed at the cutoff | Session 30, "Unnamed route #6": 79.4 s, stopped at odometer 4080, flags contact, cutoff, rewind | Fixed in the code (ADR 30). The session still shows its old time until it is reprocessed |
| F4 abandoned run timed as confirmed | Session 29, "Unnamed route #5": 59.2 s, odometer reset at 2483 after a 5.5 s gap, flag contact | Fixed in the code (ADR 30). The session still shows its old time until it is reprocessed |
| F5 clock starts at the line | Session 43 (drag): 14.449 s recorded, `CurrentLap` 16.7 s in the last packet. Ito Sprint sessions 22 and 24: 2:52.7 and 2:59.4 recorded | Open; needs one result-screen time |
| F6 course not in the catalogue | Sessions 43, 45 and 47, "Unnamed route #9": start (-1883.6, -186.5), span 5.5 by 1000.9 | Open; needs the in-game name |
| F7 deleted for unknown reasons | Sessions 49 and 52: 125 s and 184 s, not gridded | Open. `LS_KEEP_DISCARDED=1` is set on the collector until one drift event is captured, then to be turned off |
| F10 lap ids change on reprocess | Session 41: lap ids 31 to 35 became 42 to 46 | Open |

Routes 5 and 6 both start 60 m from the catalogue's Hokubu Ascent start line
(the grid is at odometer -70.8) and follow its shape. Nobody has completed that
course here, so there is no Hokubu Ascent route to move them onto.

Attempt counting (ADR 31) started on this installation on 2026-10-13. Sessions
29 and 30 are counted as two given-up attempts at Hokubu Ascent. The discarded
sessions before that (49, 50 and 52 among them) were not recorded and are not
in the count.
