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

- May: make the app work under a configurable URL prefix; remove the browser
  update check; add configuration for bind address and allowed host; write
  deployment files in this repo.
- May not: run anything as root, edit the gateway repo, or open firewall
  ports. Those steps are written up for the owner to run.
- Real recordings are data. Copy them for analysis; never edit or delete them.

## Acceptance criteria

1. With a prefix configured, every page, API call and WebSocket works through a
   proxy that strips the prefix; with none configured, behaviour is unchanged.
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

## Evidence

| ID | What | Where |
|---|---|---|
| E1 | Capture/replay findings and scope | [Capture record](https://github.com/adrianhensler/splittime/pull/10#issuecomment-6118975642); `docs/BUILD_PLAN.md` dated checkpoint |
| E2 | Outstanding deployment/field checks | This packet's acceptance criteria and `docs/hosting/test-hensler-work.md` |

Raw recordings stay private and local; no packets, coordinates or database are in Git.

## Known, unknown, unproven

- **Known:** upstream pages use absolute URLs (WP-000 C5).
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

Application code is at `f68d70a` in PR #10. Local capture work has started;
shared deployment has not. The original live recording is untouched. Only new
recordings use the repaired detector; separate copies supplied replay evidence.

Next: prepare whole-app prefix/WebSocket and Docker checks, then complete
private deployment within its existing authority and obtain the second
driver's unattended recording. Collect the remaining event/measurement matrix
incrementally. Do not replay or edit the live data directory.

## Verification

Opus independently reviewed the code repair at `f68d70a`, but did not see the
private capture. Packet/replay claims rest on Codex inspection and owner ground
truth. Deployment, second-driver and full matrix checks remain unverified.

## Acceptance

Partial evidence only; no deployment or full packet admission.
