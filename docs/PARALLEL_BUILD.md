# Parallel build coordination — SplitTime

**Owner direction:** ship a nearly complete runnable WIP/POC quickly. Workpacket-light is a secondary experiment. No formal packet approval ritual between authorized working increments.

## Immediate simultaneous tracks

| Agent | Branch | GitHub issue | Owns now | Must avoid |
|---|---|---|---|---|
| Opus 5.5 | `feat/opus-lapscope-baseline` | [#1](../issues/1) | Pinned LapScope snapshot import, attribution, upstream tests/simulator | `prototype/` |
| GPT-6 | `feat/gpt6-rivalry-dashboard` | [#2](../issues/2) | Standalone, functioning static rivalry dashboard with labelled simulated data | upstream `app/`, `tests/`, `tools/` |

Both branch from the same main commit. Neither edits the other's files. The full initial instructions are in the issues; **read your assigned issue before coding**. Pull requests target `main`, and each agent independently reviews the other's PR before integration. No special authority or permissions are granted by this document.

**Order that matters:** baseline import must merge before real two-driver backend changes. The static prototype can proceed concurrently because it depends on no upstream files. After the baseline is merged: GPT-6 works on driver-aware collection/storage/API; Opus works on route-fixed corner analysis in an isolated module; both coordinate their data contract before connecting modules.

## Integration boundary (provisional, for POC only)

Keep the frontend adapter small, with no dependency on database internals. Normalized records should distinguish:

- `driver_id`, `session_id`, `attempt_id`, `route_id`, `car_ordinal`, `car_class`, `car_pi`
- `event_mode`: inferred label **or unknown**, with a classification source; a physical route match is not proof of competitive equivalence
- `lap_time_s` nullable, and `timing_source`: game-provided, derived, estimated or unknown
- Independent `completion`: complete / incomplete / provisional
- Independent `validity`: accepted / suspect / excluded / unknown
- Independent `capture_quality`: continuous / discontinuous / unknown
- Time-series channels indexed by normalized **route position** for drawing speed/throttle/brake and cumulative lap delta

These are **conceptual adapter fields**, not a request to change the production schema all at once. Convert to the existing LapScope representation carefully and preserve provenance. Do not assign zero to unknown lap time or infer a race win from a stream cutoff.

## POC definition of done

1. Both driver streams can be recorded independently by UDP destination port and stored without state leakage.
2. Sessions/attempts are automatically classified to the extent supported by telemetry; unknowns are explicit.
3. A browser page shows route and class records, differences between drivers on different dates, telemetry comparison and a small corner diagnostic.
4. Suspicious, incomplete or estimated laps remain visible but cannot silently win rankings.
5. A simulated end-to-end demo is reproducible; real captures are sought early and clearly differentiated from simulation.
6. Web access is routed through existing authentication and independently checked before exposing destructive management APIs.

## Verification and handoff rules

For each PR, provide exact commit SHA, commands/results actually run, 1-2 reproducer steps, known unknowns, and a testable next action. A model checking its own code is **self-checking**, not independent verification. Ask the counterpart to design at least one adverse test beyond the PR author's happy path. A review finding can be "unverified" rather than manufactured success.

Existing `work/WP-001..WP-006` are lightweight checklists; no new Workpacket runtime, schema, or mandatory signatures. Git hashes are content identity, not truth or authorization. User retains acceptance and deployment authority.

## Notes to Opus

The independent review is [REVIEW_HANDOFF_2026-10-12.md](REVIEW_HANDOFF_2026-10-12.md); its unfinished-attempt, route equivalence, event-mode uncertainty, timing provenance and security findings stand. Import the upstream baseline without modifying it before changing architecture. See [WP-001](../work/WP-001-import-baseline.md). Start #1 immediately and send a PR for review. The static prototype can be developed without coordinating every UI detail.

## Notes to GPT-6

Build #2 independently, now. After Opus's import PR is reviewed/merged, connect frontend and backend in bounded slices rather than waiting to implement the entire domain model. Don't make a claim of actually running Forza or receiving UDP packets on the basis of simulated UI.

## Integration owner

GPT-6 coordinates integration and cross-review; Opus's review may surface blocking problems, and the owner remains the acceptor. Changes to gateway/privileged deployment need separate explicit authority.
