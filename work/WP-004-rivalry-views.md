# WP-004: Rivalry views (M3)

| | |
|---|---|
| Status | partial; repaired exploratory API/page in PR #10, ranked rivalry/history not implemented |
| Parent | WP-000 |
| Children | none |
| Worker | Codex (checkpoint owner); original implementation by GPT-6 |
| Verifier | Opus 5.5: API/page repairs and final browser review at `f68d70a` |
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

Final application snapshot at `f68d70a`; candidate bests are not ranked leaders.

| # | Claim | Basis |
|---|---|---|
| C1 | Provenance/name/order repairs pass; page stays exploratory | E1, E2 |
| C2 | Ranked leaders/history and full quality/mode classification are absent | E3 |

## Evidence

| ID | What | Where |
|---|---|---|
| E1 | API/UI regressions | `python -m pytest -q tests/test_rivalry.py tests/test_rivalry_review.py`; `node --test tests/ui/rivalry.test.cjs` |
| E2 | Independent adverse/browser review | [Opus final review](https://github.com/adrianhensler/splittime/pull/10#pullrequestreview-5490170368) |
| E3 | Quality/timing/mode unknown, winner null, no record history | `app/rivalry.py` at `f68d70a` |

## Known, unknown, unproven

- **Unproven (assumed):** ADR 10 ranking rules are worker defaults not yet
  confirmed by the owner.
- **Unknown:** whether Rivals and race lap times on one route are comparable.

## Unresolved

Competitive scoring, real route equivalence, event mode, full quality
classification and record-change history remain unresolved. The current
projection explicitly has no winner and preserves unknowns.

## Event-type guess (2026-10-12, Opus 5.5, `feat/event-guess`)

Owner's decision: capture every event and guess its type; manual tagging can
come later if needed. `app/eventtype.py` guesses `rivals`, `race` or `unknown`
per session and every rivalry attempt carries it as `event_mode` with
`event_mode_basis: "guess"`. Rules: any race position above 1 means `race`;
the lap clock resetting at the first start line means `rivals`; otherwise
`unknown`. The Rivals rule rests on one real capture, which it classifies
correctly (approach 2.493 s, position 1 throughout). Nothing is filtered or
ranked by the guess yet. Re-run: `pytest -q tests/test_eventtype.py`.

Also: `source_addr` (the sender's IP and port) is no longer included in any
API response, since the pages may be served without a login.

## Checkpoint

Branch `feat/gpt6-rivalry-api`,
[PR #7](https://github.com/adrianhensler/splittime/pull/7), holds the API and
live evidence. Before repair, two tests reproduced manual cutoff clearance
promoting an estimate and missing known car names. Repairs preserve `flags_auto`
provenance, use a shared car-name resolver and round displayed times to milliseconds.
Re-run `python -m pytest -q tests/test_rivalry.py tests/test_rivalry_review.py`.
The repaired base and both source fixes are included at `f68d70a` in PR #10.
Opus independently re-checked source repairs and later UI changes at `f68d70a`.
Next: integrate; then propagate verified timing and
capture quality into the rivalry projection. It still emits quality/timing
and event-mode unknowns. Ranked rules/equivalence and history remain open.

## Verification

Independent Opus and automated reviews reproduced both defects; Opus confirmed
the repairs at `7c81323`. His browser review of the source page included XSS
and prefix checks. Current combined self-checks are recorded in PR #10; the
later UI repairs passed his narrow-screen, long-name and escaped-name browser
checks at `f68d70a`. Full real-game comparison remains unverified.

## Acceptance

Pending reviewed integration merge; the full scoring/history and real-route
criteria remain incomplete even after the current POC merges.

## Integration checkpoint, 2026-10-12

PR #7 repair `fe27989` and repaired backend merge `8684f17` are included in
the PR #10 branch. The page remains in PR #9 and is also in PR #10. Fetch and
check both PRs before editing; original API/page commits `5d09fd1` / `6ad4b57`
are historical baselines. Review the combined fixes before merging; competitive
scoring, real captures and deployment are still unverified.

## PR #19 checkpoint (2026-10-12, Opus 5.5)

[PR #19](https://github.com/adrianhensler/splittime/pull/19), branch
`fix/rivals-finish-artifacts`. Page change only for this packet: each
completed lap links to a comparison against the fastest other lap on the
route, same driver included, so one driver can compare their own laps.
Evidence: `node --test tests/ui/rivalry.test.cjs`. The lap-detection change in
the same pull request is outside this packet's authority and is recorded in
[WP-003](WP-003-deploy-and-real-captures.md); driver labels are in
[WP-002](WP-002-two-drivers.md). Ranking is unchanged: still exploratory, no winner.
The review repair on top of `560aa52` changes no page or rivalry code;
`node --test tests/ui/*.test.cjs` re-run there: 49 passed. Incomplete attempts
the recorder now keeps are untimed, so they add no comparison link.
