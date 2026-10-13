# Merge runs: behaviour and proposed wording

Source reviewed on 2026-10-12, based on `5059dbb`. No live management requests
were made and grouping behaviour is unchanged by Rivalry v2.

## What it actually does

“Merge runs” creates a persistent group index. The sessions share a card and
a combined lap table. It does not stitch packets, change lap detection, erase
original sessions or rewrite their edits. Ungroup deletes only the index and
clears membership. Removing one member leaves the group until its last member
is removed. Existing synthetic API regressions demonstrate these properties.

Candidates must have the same driver, identified route and car ordinal, and
must be ungrouped. Class, PI, tune, mode and date need not match. Matching a
route fingerprint does not establish competitive equivalence.

The dialog preselects a suggested sitting around the clicked session. It
chains consecutive **session start** gaps of at most two hours. A chain can
span much longer than two hours, and does not use session end times. Other
eligible dates are offered too. The user must confirm to create the group.

## Surprises to resolve

1. **“Merge” implies a data transformation.** The operation is grouping, while
   its explanation says “scored against each other.” This can sound like an
   irreversible merge or an authoritative ranking.
2. **Selection is larger than the clicked item.** The nearby sitting is already
   checked, with no prominent count or concise description of how it was chosen.
3. **The choice list omits useful differences.** It shows date, lap count and
   best, but not driver, car/PI or inferred mode. The same car may have changed
   class or PI between sessions.
4. **“Best” has different meanings across pages.** The group API chooses the
   fastest timed, non-excluded lap, including flagged and cutoff laps. Rivalry
   candidate bests exclude flags and estimates. A grouped table needs explicit
   labels for those differences; grouping should not imply a clean PB.

## Small next change

Use **Group sessions** and **Create group**, with “Show these recordings
together. Original sessions and edits stay separate. Ungroup shows their
separate cards again.” Show a selected count and each session's date, driver,
car/PI and mode guess. Start with only the clicked session selected; offer
“Select suggested sitting” as an explicit action, explaining the start-gap
rule. Keep lap comparison as a separate read-only action. Do not silently
change scoring, merge captures or add cross-driver groups.

Implementation references: `mergeCandidates`, `timeClusters`, `mergeRuns` in
`app/static/js/analysis.js`; `_check_members` and `group_laps` in
`app/api/routes.py`; group methods in `app/recorder/store.py`.
Re-run `python -m pytest -q tests/test_api.py -k group` and
`node --test tests/ui/driver-groups.test.cjs` with synthetic storage.
