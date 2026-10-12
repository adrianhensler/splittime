# WP-004: Rivalry views (M3)

| | |
|---|---|
| Status | in-progress; exploratory records shipped on branches, scoring/history incomplete |
| Parent | WP-000 |
| Children | none |
| Worker | GPT-6; resumed by Codex on 2026-10-12 |
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

Competitive equivalence and scoring defaults remain unresolved. The implemented
POC deliberately shows candidate records and no winner. Full mode/quality
classification, dated record-change history and real-capture route validation
remain incomplete.

## Checkpoint

Read-only API: `5d09fd1` on `feat/gpt6-rivalry-api`
([PR #7](https://github.com/adrianhensler/splittime/pull/7)). Browser page:
`6ad4b57` on `feat/gpt6-rivalry-page`
([PR #9](https://github.com/adrianhensler/splittime/pull/9)). Both are in
`feat/codex-integrated-poc` at `3ed8f6c`
([draft PR #10](https://github.com/adrianhensler/splittime/pull/10)), not main.
PRs hold live claims, tests and limits. Re-run `node --test tests/ui/*.test.cjs`
and `python -m pytest -q tests/test_rivalry.py --basetemp=<new-scratch-directory>`.
Fetch and inspect current refs before starting another implementation.

## Verification

Recovery session ran the combined suite (205 passed), driver/rivalry subset
(21 passed) and UI controllers (8 passed), plus a browser smoke on simulator
recordings. Newly authored integration checks are self-checks. Competitive
fairness and real-game behaviour remain unverified.

## Acceptance

—
