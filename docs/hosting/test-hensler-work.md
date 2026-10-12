# Reference deployment: test.hensler.work

This is the owner's personal hosting. The generic guide is
[../SETUP.md](../SETUP.md). This record describes the deployment checked on
2026-10-12; it replaces the earlier unexecuted gateway plan.

## Running installation

- Public site: <https://test.hensler.work/splittime/rivalry.html>, also linked
  from the public projects page.
- SplitTime runtime: `1e51eb96b658c502c37df01e692072391b0c30ef` (#15).
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

The inherited Live-page overlay suggests loopback/LAN settings and the first
configured port. Those are not this deployment's settings; use the table above.
Repairing that inherited help is a small remaining UI task, separate from
whether the two listeners can receive data.

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

## Remaining field checks

The two reachability packets were not game recordings. Each driver next sends
one fresh real event, verifies attribution/game time, and later records on a
different day without server intervention. The friend's own network is untested.
Complete WP-003's circuit/Rivals/sprint/quit/rewind/free-roam matrix, observed
packet rates, internet jitter/loss/timing comparison and storage-churn measurement.
Source-address evidence may show Docker's bridge rather than the game sender;
identity remains by port. Direction, official validity and cross-car equivalence
are unproven. Scheduled backups/retention monitoring are not installed by this
slice. Do not edit or replay recordings in the live data directory.
