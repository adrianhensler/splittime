# WP-003: Deploy and real captures (M2)

| | |
|---|---|
| Status | partial; one local real capture checked, shared deployment and full field matrix not done |
| Parent | WP-000 |
| Children | none |
| Worker | Codex (checkpoint owner); local capture work, deployment work unassigned |
| Verifier | owner supplied capture ground truth; Opus reviewed repair at `f68d70a`; deployment unverified |
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
- May not: run anything as root, edit the gateway repo, or open firewall
  ports. Those steps are written up for the owner to run.
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

One local recording is partial evidence, not deployment acceptance.

| # | Claim | Basis |
|---|---|---|
| C1 | One confirmed Rivals run has exact game lap timing; copied replay removes false rewind | E1; Codex inspection and owner ground truth |
| C2 | Shared deployment and full event matrix are incomplete | E2; no deployment receipt or second-driver field capture |
| C3 | Relative URLs and app-side HTTP/WebSocket routing work at root and under prefixes | E3; independent Codex checks; real gateway upgrade/authentication still unverified |

## Evidence

| ID | What | Where |
|---|---|---|
| E1 | Capture/replay findings and scope | [Capture record](https://github.com/adrianhensler/splittime/pull/10#issuecomment-6118975642); `docs/BUILD_PLAN.md` dated checkpoint |
| E2 | Outstanding deployment/field checks | This packet's acceptance criteria and `docs/hosting/test-hensler-work.md` |
| E3 | Prefix implementation, author Docker/browser checks and independent URL/ASGI routing checks | [PR #13](https://github.com/adrianhensler/splittime/pull/13), reviewed head `982b54f`, merged at `d096489` |

Raw recordings stay private and local; no packets, coordinates or database are in Git.

## Known, unknown, unproven

- **Known:** imported upstream pages used absolute URLs (WP-000 C5).
  PR #13 replaces them with relative URLs; root and prefixed app routing are
  independently checked. The real gateway is still unverified.
- **Known for this local run:** 16,333 frames; 150.807556 s agrees exactly
  with game LastLap/BestLap; owner confirms Rivals, contact and no rewind.
  Copied replay after `175bffe` retains time/contact and removes the false
  first-start rewind. Corrected timed trace has zero timestamp gaps.
- **Unknown:** everything in the "Things to confirm" table of the hosting doc.
- **Unknown:** internet delivery, second-driver rate and events, real rewind,
  sprint/race/abandonment cases, and measured free-roam/storage behaviour.

## Unresolved

- The owner runs the root and gateway steps.
- Both drivers need to be available to drive the capture list.

## Checkpoint

PR #10 supplied the integrated POC. PR #13's prefix slice is merged at
`d096489`; its reviewed head is `982b54f`. Local capture work has started;
shared deployment remains unverified. The original live recording is
untouched. Only new recordings use the repaired detector; separate copies
supplied replay evidence.

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

Next: apply the gateway steps on the owner's go-ahead, check WebSocket and
`forward_auth` there, then complete
private deployment within its existing authority and obtain the second
driver's unattended recording. Collect the remaining event/measurement matrix
incrementally. Do not replay or edit the live data directory.

## Verification

Opus independently reviewed the code repair at `f68d70a`, but did not see the
private capture. Packet/replay claims rest on Codex inspection and owner ground
truth. Codex independently checked the prefix application slice at `982b54f`;
the container/browser smoke results in PR #13 are Opus's self-checks.
Deployment, second-driver and full matrix checks remain unverified.

## Acceptance

Partial evidence only; no deployment or full packet admission.
