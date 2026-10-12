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
existing gateway's login gate (ADR 17).

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

*Rests on:* 2, 6. *Work:* WP-003.

## 17. The owner's deployment is documented separately from the software

**Accepted, 2026-10-12.**
The owner hosts SplitTime under test.hensler.work, as a container in an
existing gateway at path `/splittime/`, with telemetry going directly to the
server's public IP. That is one deployment, described in
[hosting/test-hensler-work.md](hosting/test-hensler-work.md). No site-specific
name, path or assumption goes into the code or the generic documents.

*Rests on:* 5, 6, 15, 16.
