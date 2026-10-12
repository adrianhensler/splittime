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
