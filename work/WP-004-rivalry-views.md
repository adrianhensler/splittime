# WP-004: Rivalry views (M3)

| | |
|---|---|
| Status | in-progress; exploratory API in PR #7, fixing independent review findings |
| Parent | WP-000 |
| Children | none |
| Worker | GPT-6; review repairs by Codex on 2026-10-12 |
| Verifier | — |
| Acceptor | owner |

## Intent

Show the two drivers against each other: who holds which record, and how their
laps compare.

## Outcome

Driver labels throughout, a records table per route and class, a rivalry score
and history, and an overlay that says whether a comparison is ranked or
exploratory.

## Authority and limits

- May: add API endpoints and pages; add a capture-quality flag; adjust the
  session list and analysis page.
- May not: change how laps are detected; change ranking rules without a new
  ADR entry.

## Acceptance criteria

1. Sessions and laps show their driver everywhere, and can be filtered by one.
2. A records table lists, per route and car class, each driver's best ranked
   lap with car and PI, and who leads.
3. Laps flagged rewind, contact, cutoff or gapped are excluded from ranking and
   still visible, each with its reason.
4. A lap with gaps in `TimestampMS` is marked gapped; the threshold is a named
   constant with a test.
5. The same route driven by both drivers resolves to one route; a route sharing
   roads but with a different start or direction does not merge (acceptance
   check 3), shown on real captures from WP-003.
6. Rivals and race laps on one route appear together, labelled by kind
   (acceptance check 5).
7. Overlaying laps from different classes or kinds is labelled exploratory and
   names no winner.
8. A rivalry page shows the count of categories each driver leads and a dated
   history of record changes.

## Context

- `docs/DESIGN.md` sections 5 and 7
- `docs/ADR.md` entry 10
- Findings recorded by WP-003

## Claims

| # | Claim | Basis |
|---|---|---|

## Evidence

| ID | What | Where |
|---|---|---|

## Known, unknown, unproven

- **Unproven (assumed):** ADR 10 ranking rules are worker defaults not yet
  confirmed by the owner.
- **Unknown:** whether Rivals and race lap times on one route are comparable.

## Unresolved

Competitive scoring, real route equivalence, event mode, full quality
classification and record-change history remain unresolved. The current
projection explicitly has no winner and preserves unknowns.

## Checkpoint

Branch `feat/gpt6-rivalry-api`,
[PR #7](https://github.com/adrianhensler/splittime/pull/7), holds the API and
live evidence. Before repair, two tests reproduced manual cutoff clearance
promoting an estimate and missing known car names. Repairs preserve `flags_auto`
provenance, use a shared car-name resolver and round displayed times to milliseconds.
Re-run `python -m pytest -q tests/test_rivalry.py tests/test_rivalry_review.py`.
Next: incorporate the repaired PR #6 base, verify the combined suite, push
without rewriting history, and seek independent re-review before merging.

## Verification

Independent Opus and automated reviews reproduced both defects. Repair tests
are this worker's self-checks; full results are in PR #7. Real-game behaviour
and independent re-review of the repair remain pending.

## Acceptance

## Integration checkpoint, 2026-10-12

PR #7 repair `fe27989` and repaired backend merge `8684f17` are included in
the PR #10 branch. The page remains in PR #9 and is also in PR #10. Fetch and
check both PRs before editing; original API/page commits `5d09fd1` / `6ad4b57`
are historical baselines. Review the combined fixes before merging; competitive
scoring, real captures and deployment are still unverified.

—
