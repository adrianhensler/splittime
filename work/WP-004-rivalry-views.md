# WP-004: Rivalry views (M3)

| | |
|---|---|
| Status | partial; original exploratory API/page admitted; compact Rivalry v2 and local recorded history in review |
| Parent | WP-000 |
| Children | none |
| Worker | Codex (checkpoint owner); original implementation by GPT-6 |
| Verifier | Opus 5.5 at `f68d70a`; GPT-6 Astra: Rivalry v2 source and targeted tests at `0a483cd` |
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
| C3 | Rivalry v2 adds compact recorded bests/gaps, finish-dated local history, search, actual outlines and A/B comparisons alongside the original; official ranking remains absent | E4 |

## Evidence

| ID | What | Where |
|---|---|---|
| E1 | API/UI regressions | `python -m pytest -q tests/test_rivalry.py tests/test_rivalry_review.py`; `node --test tests/ui/rivalry.test.cjs` |
| E2 | Independent adverse/browser review | [Opus final review](https://github.com/adrianhensler/splittime/pull/10#pullrequestreview-5490170368) |
| E3 | Quality/timing/mode unknown, winner null, no record history | `app/rivalry.py` at `f68d70a` |
| E4 | Rivalry v2 self-checks; final reviewed/deployed head pending | Checkpoint below; `tests/ui/rivalry-v2.test.cjs`, `tests/test_rivalry.py` |

## Known, unknown, unproven

- **Unproven (assumed):** ADR 10 ranking rules are worker defaults not yet
  confirmed by the owner.
- **Unknown:** whether Rivals and race lap times on one route are comparable.

## Unresolved

Competitive scoring, real route equivalence, event mode, full quality
classification and ranked record-change history remain unresolved. The current
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
PR #10 merged the reviewed exploratory slice at `0015f01`; source PRs #7 and
#9 closed as superseded. Next: propagate verified timing and
capture quality into the rivalry projection. It still emits quality/timing
and event-mode unknowns. Ranked rules/equivalence and history remain open.

## Verification

Independent Opus and automated reviews reproduced both defects; Opus confirmed
the repairs at `7c81323`. His browser review of the source page included XSS
and prefix checks. Current combined self-checks are recorded in PR #10; the
later UI repairs passed his narrow-screen, long-name and escaped-name browser
checks at `f68d70a`. Full real-game comparison remains unverified.

## Acceptance

Reviewed exploratory POC admitted by PR #10's merge at `0015f01`; the full
scoring/history and real-route criteria remain incomplete.

## Integration checkpoint, 2026-10-12

PR #7 repair `fe27989` and repaired backend merge `8684f17` are included in
the PR #10 branch, subsequently merged at `0015f01`. Source PRs #7 and #9
closed as superseded; original API/page commits `5d09fd1` / `6ad4b57` are
historical baselines. Competitive scoring and real two-driver route equivalence
remain unverified; later deployment evidence is in WP-003.

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

## Rivalry v2 checkpoint, 2026-10-12

Owner approved the compact preview, requested a main-page “Rivalry v2” link
while retaining the original, and requested a merge/grouping UX review.
Checkpoint owner: Codex. Branch `feat/rivalry-v2`, based on `5059dbb`.
[PR #23](https://github.com/adrianhensler/splittime/pull/23), implementation head
`0a483cd215ef3247efd5225c21ee4e445197be0a`. This snapshot changes documentation
only on that tested code; the PR contains the final head and CI receipt.

Implemented: dense route/class rows in configured driver order, candidate
bests and recorded differences, real recorded outlines, search, finish-dated
PB/lead-change history and explicit A/B selection into the existing comparison.
API adds `finished_at_utc` from stored `ended_t`; no schema or recorder change.
Original Rivalry HTML/JS are byte-identical. No illustrative opponent or fixture
is shipped. Undated clean attempts suppress uncertain record chronology;
simultaneous timestamps are batched; refresh resets reused lap identities.

Self-checks: Python 3.13 isolated environment, full `python -m pytest -q`:
300 passed; `ruff check .` (0.17) and packet round-trip passed. Node UI suite:
61 passed, including refresh/reused-identity regression.
Browser on synthetic data under `/splittime/`: rendered compact layout, history
filter 6 to 4 attempts, selected B changed actual comparison URL from laps 2/5
to 2/1. No live management API was called. Grouping properties were checked
with existing synthetic API regressions; findings and proposal are in
`docs/MERGE_RUNS_UX_REVIEW.md`, with no grouping behaviour changed.
Browser followed the link to the existing comparison under the same prefix.
Narrow viewport request of 390 px was clamped by this browser to an observed
500 px: page width stayed within that viewport, tables scrolled internally
and the comparison inspector stacked beneath history. Actual phone behaviour
has not been independently verified.

Re-run: `python -m pytest -q`; `ruff check .`;
`python app/telemetry/packet.py`; `node --test tests/ui/*.test.cjs`.
An older global Ruff reported an inherited E721 idiom; the repository's current
requirements environment passes. The network-sandboxed full Python run stalled;
the isolated suite completed outside that sandbox with synthetic loopback tests.

Unknowns: official event equivalence/validity, complete capture quality,
real two-driver field validation and global standings. This admits no ranked
winner or accuracy claim. Finish dates are capture timestamps, not official
achievement timestamps. Existing full acceptance criteria remain partial.

Independent verification: **GPT-6 Astra**, source review at `0a483cd`, Node
61/61 and focused rivalry/grouping Python tests 22 passed (52 deselected).
No blockers; original Rivalry files unchanged, relative URLs, eligibility,
chronology, escaping and selection identity verified. It did not rerun the
full Python suite or independently verify browser/live/deployment behaviour.
The same-model review was stopped after owner feedback and is not admission
evidence. Different-model review does not guarantee correctness. Final docs
head/CI check remains the reviewer's responsibility before merging.
Acceptance: pending reviewed merge. Deployment: not yet performed. Next action:
open PR, address review, snapshot final evidence before ready; reviewer merges
green CI, then update only the existing web service and static gallery link,
preserving the running collector, original Rivalry and captured data.
