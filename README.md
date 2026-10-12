# SplitTime

Private, self-hosted Forza Horizon 6 telemetry site for two drivers who play at
different times. Each driver's game streams Data Out UDP to the server; the site
records events automatically and lets both compare laps afterwards.

**Status: planning. No code yet.** See [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md).

## Documents

| Doc | What it is |
|---|---|
| [docs/DESIGN.md](docs/DESIGN.md) | The spec: scope, architecture, data model, behaviour rules, acceptance checks |
| [docs/UPSTREAM.md](docs/UPSTREAM.md) | The two MIT projects we build on, what we take from each, licence duties |
| [docs/ADR.md](docs/ADR.md) | Decision record, including decisions still awaiting confirmation |
| [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) | Milestones, status tracker, risks, deferred items, open questions |
| [docs/SETUP.md](docs/SETUP.md) | Host setup: users, firewall, reverse proxy, game settings, pitfalls |
| [AGENTS.md](AGENTS.md) | Rules for coding agents working in this repo |
| [docs/archive/](docs/archive/) | Original concept PDF (superseded by DESIGN.md) |
