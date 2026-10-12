# SplitTime — independent review and builder handoff

**Date:** 2026-10-12  
**Audience:** Opus 5.5 and any subsequent coding/review agent  
**Status:** Documentation/source review only; no SplitTime code was run or
independently tested. Not owner acceptance.

## Mandate

The owner wants a **fast route to a nearly complete working WIP/POC**:
two drivers play asynchronously, FH6 sends telemetry directly to distinct
UDP ports on the VPS, and the website automatically organizes recorded
events, records, comparisons and eventually corners. No recording controls
during gameplay. Workpacket is **lightweight bookkeeping**, not part of the
product, a mandatory runtime, or a repeated approval ritual.

Build on the pinned MIT LapScope code, supplement corner methods from
Forza-6-telemetry where useful, and prioritize a usable vertical slice.
Do not start another lengthy architecture-documentation phase.

## Corrections and challenges to the existing design

1. **Recognized unfinished events:** Previously specified as worth retaining,
   yet DESIGN had discarded anything without a completed lap. Keep a minimal
   incomplete-attempt summary when an event was actually recognized; do not
   invent a lap time or rank it. Free roam remains discarded. Retention of
   incomplete raw samples may be bounded.
2. **Route match is not competitive equivalence:** LapScope's pinned
   `match_or_create_route` checks start position, its track-distance
   parameter, and bounding-box spans; this is not proof of direction,
   checkpoint order or event timing equivalence. Use a shared candidate route
   for browsing; defer/flag ranked comparison if equivalence is unknown.
3. **Game modes:** Upstream circuit/sprint classification is not a reliable
   Rivals-versus-race identifier. Store inferred mode *or unknown*, plus the
   basis for classification when available. Cross-mode records remain
   exploratory unless timing equivalence is demonstrated; ADR 10's ranking
   choices are still proposed.
4. **Timing and capture quality:** Use in-game timers when available. Upstream
   cutoff and geometric finishes can be derived/estimated, so mark provenance.
   Detect timestamp discontinuities, but do not equate every gap with packet
   loss: pauses, frame pacing and focus changes are possible. Never convert a
   stream ending into a confirmed race victory without supporting evidence.
5. **Two UDP ports label, not authenticate:** Valid-looking packets can be
   forged. Keep rate/queue/disk bounds, record anomalies, and verify the
   gateway blocks direct access to delete/edit/reprocess APIs. No local relay
   is required for this private two-player POC.
6. **Ranking fairness:** Show car/PI, mode, flags, timing provenance and data
   quality. Route × class and mixing Rivals with ordinary races are *defaults
   awaiting owner confirmation*, not established competitive fairness.
7. **Storage:** Keeping raw timed-event data is useful for reprocessing, but
   unlimited retention must be visible, monitored and ultimately bounded by
   available disk space. Preserve original packet bytes where promised.

## Builder guidance — favour useful software over paperwork

- **First slice:** Import the pinned upstream snapshot without modifying it,
  preserve licences, run upstream tests/simulator. Keep a traceable import
  commit (WP-001).
- **Next:** Two listeners/trackers, driver IDs on sessions, one shared database.
  Simulate concurrent streams from one source IP to distinct destination ports;
  ensure sessions, bests, cleanup and reprocess stay isolated (WP-002).
- **Show something early:** Add the simplest route/driver records page and
  speed/brake traces from simulated captures. Do not wait for both drivers to
  produce the complete real-world event matrix before showing a functional POC.
- **Deploy deliberately:** Only after gateway authentication and endpoint
  isolation are checked; do not grant agents root/docker/gateway privileges
  by convenience. Get one real recording, then progressively validate others.
- **Add corner diagnosis:** Stable route-fixed segments; braking/apex/exit
  measurements must trace to captured channels. Causes and coaching remain
  hypotheses, not telemetry facts.

For each meaningful slice, record **commit SHA, test command/results, actual
behaviour, unresolved items, and the next reproducible action**. The existing
WP files are checklists. Do not generate more packet documents or stop after
each one merely to solicit verifier ritual. An independent reviewer can
examine a coherent code increment and cannot infer passing tests from prose.

## Specific feedback on WORKPACKET_TAKEAWAYS.md

The other agent was appropriately cautious: its observations are **candidates,
not empirical findings**. Keep its useful ideas: pinned context locators,
labelled assumptions, explicit dependency/reversal links, and agent-neutral
handoffs. Two caveats matter:

- **Git proves bytes, not truth or authority.** Authorship fields are
  configurable. Hashes help identify an artifact, not verify an assertion.
- **Proceed on assumptions only for reversible choices.** Security,
  access, truth of a race finish, and acceptance authority may not be silently
  presumed. Mark guesses as guesses and keep an explicit unknown state.

The WP-000 planning packet is labelled complete, not admitted. Its documents
exist; setup and in-game steps remain unexecuted or asserted. This review is
not proof of a successful deployment, runtime test or independent acceptance.

## Suggested independent verification at useful checkpoints

- Two simulated players at once, from the same IP but different UDP ports,
  cannot leak driver IDs, state or lap records into each other.
- Abandon lap 3 of a 3-lap race: laps 1 and 2 persist; no false finish.
  Abandon a recognized event before lap 1: incomplete summary, no ranking.
- Same route matches across players; a similar but different direction/route
  is not silently awarded a competitive record. Unknown remains visible.
- Inject corrupt, oversized, missing, out-of-order and spoofed frames;
  invalid input cannot crash the recorder, forge accepted records unnoticed,
  or grow unbounded queues/storage.
- Timing from captured/game fields agrees with expected laps, while uncertain
  cutoffs are visibly provisional and timestamp gaps are not misdiagnosed.
- Confirm management HTTP is inaccessible from the public internet without
  the gateway, and authorized paths work under the configured URL prefix.

**Open decisions still for owner:** class/PI and cross-mode scoring rules,
incomplete-attempt retention, practical disk budget, and when an exploratory
comparison earns competitive status. Do not block basic POC development on
decisions that can remain labelled, reversible defaults.
