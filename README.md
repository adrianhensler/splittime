# SplitTime

Private, self-hosted Forza Horizon 6 telemetry site for two drivers who play at
different times. Each driver's game streams Data Out UDP to the server; the site
records events automatically and lets both compare laps afterwards.

**Status: planning complete, no code yet.** Next:
[work/WP-001-import-baseline.md](work/WP-001-import-baseline.md).

## Documents

| Doc | What it is |
|---|---|
| [docs/DESIGN.md](docs/DESIGN.md) | The spec: scope, architecture, data model, behaviour rules, acceptance checks |
| [docs/DATA_FLOW.md](docs/DATA_FLOW.md) | What is sent, by whom, to where, and what is kept |
| [docs/GAME_SETUP.md](docs/GAME_SETUP.md) | One-page setup for each driver |
| [docs/SETUP.md](docs/SETUP.md) | Running a server: accounts, firewall, reverse proxy, pitfalls |
| [docs/hosting/](docs/hosting/) | The owner's own deployment, as a worked example. Not part of the software. |
| [docs/UPSTREAM.md](docs/UPSTREAM.md) | The two MIT projects this builds on, and licence duties |
| [docs/ADR.md](docs/ADR.md) | Decision record |
| [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) | Milestones, risks, deferred items, open questions |
| [docs/WORKPACKETS.md](docs/WORKPACKETS.md) | How work is assigned, recorded, verified and accepted |
| [work/](work/) | One Workpacket per milestone |
| [AGENTS.md](AGENTS.md) | Rules for any coding agent or person working here |
| [docs/WORKPACKET_TAKEAWAYS.md](docs/WORKPACKET_TAKEAWAYS.md) | Notes for the separate Workpacket project |
| [docs/REVIEW_HANDOFF_2026-10-12.md](docs/REVIEW_HANDOFF_2026-10-12.md) | Independent design review, corrections and coding-agent handoff |
| [docs/upstream/](docs/upstream/) | LapScope's own documents, unchanged. Read `ARCHITECTURE.md` and `wiki/Event-Detection.md` before touching the recorder. |
| [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) | Licences of the code this includes |
| [docs/archive/](docs/archive/) | Original concept PDF (superseded by DESIGN.md) |
