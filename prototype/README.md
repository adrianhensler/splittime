# SplitTime standalone rivalry UI prototype

**Synthetic data only. Not connected to Forza, LapScope, or a VPS.**

Open `index.html` in a modern browser. No build step, npm dependency, or server is required. Select a demo route and channel, scrub the position slider, or export the synthetic CSV. This UI is isolated in `prototype/` so the other agent can import LapScope without file conflicts.

The prototype demonstrates:
- Two asynchronously recorded drivers with separate attempt dates;
- Automatic best eligible times, class/PI, inferred/unknown mode labels;
- A provisional or incomplete run remaining visible but not silently ranked;
- Matched Rival laps versus exploratory non-equivalent conditions;
- Route/telemetry visualization and candidate corner rows.

**Boundaries:** Chart values, track geometry, corner observations and all attempts are fictional. The 'eligible comparison' rule is a UI proof of concept, not final competition policy. It uses an explicit `ranked` demo flag; production equivalence must be derived from recorded evidence, route and event rules.

Next integration step after Opus merges the LapScope baseline: create a minimal API adapter translating real sessions, laps and position-aligned channels into the view model, and independently verify the classification/timing provenance. Do not treat this dataset as a recorded capture.

## Pure scoring rules and test contract

The browser now loads `domain.js` before the dashboard's inline rendering code.
The same plain-JavaScript functions also work under Node without a framework.
Run `node --test prototype/tests/domain.test.cjs` from the repository root
(Node 18+ recommended). These tests cover incomplete/provisional attempts,
suspect laps, unknown modes, incompatible PI/classes, unverified timing and
minute-boundary rounding.

`summarizeRoute(route)` intentionally fails closed for production ranking:
both drivers need a valid continuous recorded lap, timing provenance, and
`route.competitive_equivalence === "verified"`. The prototype uses
`summarizeRoute(route,{demo:true})` strictly to illustrate simulated outcomes.
This is a **provisional adapter**, not the final split-time eligibility policy.
Corner values and routes remain synthetic. No tests imply real Forza capture.
