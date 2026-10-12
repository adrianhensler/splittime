# WP-006: Summary page and polish (M5)

| | |
|---|---|
| Status | in-progress; local comparison page implemented, full summary criteria incomplete |
| Parent | WP-000 |
| Children | none |
| Worker | Codex recovery session, 2026-10-12 |
| Verifier | Opus 5.5: final application/browser review at `f68d70a` |
| Acceptor | owner |

## Intent

Give both drivers one page per route that answers "how do we compare here?"
without clicking around.

## Outcome

A route page combining records, flags, traces, the largest corner differences
and capture quality, plus a storage display.

## Authority and limits

- May: add a page and the endpoints it needs; reuse existing charts.
- May not: add new analysis; anything shown must already exist from WP-004 and
  WP-005.

## Acceptance criteria

1. One page per route shows each driver's PB with car and class, clean or
   suspect labels, overlaid speed, throttle and brake traces of the two PBs,
   the three largest corner differences, and capture quality (acceptance
   check 6).
2. The page links to the full analysis for either lap.
3. Storage used, per driver and in total, is shown somewhere on the site.
4. The page works under the URL prefix.

## Context

- `docs/DESIGN.md` sections 7 and 9
- Results of WP-004 and WP-005

## Claims

Final application snapshot at `f68d70a`; comparison is a partial summary slice.

| # | Claim | Basis |
|---|---|---|
| C1 | Comparison page renders overlays, measurements and readable warnings, with configured driver order | E1, E2 |
| C2 | Full route summary, selected-lap analysis links and storage display are incomplete | E3 |

## Evidence

| ID | What | Where |
|---|---|---|
| E1 | UI regressions | `node --test tests/ui/compare.test.cjs tests/ui/rivalry.test.cjs` |
| E2 | Independent mobile-width and escaped-name browser checks | [Opus final review](https://github.com/adrianhensler/splittime/pull/10#pullrequestreview-5490170368) |
| E3 | Present page scope | `app/static/compare.html` and `app/static/js/compare.js` at `f68d70a` |

## Known, unknown, unproven

- **Known:** the browser can follow the rivalry candidate pair to three trace
  overlays and the corner table in a simulator-only local demo.
- **Unknown:** real-capture accuracy, deployed gateway and URL-prefix behaviour.

## Unresolved

Per-driver storage display, links that select each lap in the full analysis
page, and a complete route summary are not done. Numbering changes when the
reference lap changes. New upstream-branch fixes must be reviewed before merge.

## Checkpoint

Application checkpoint `f68d70a` on `feat/codex-integrated-poc`
([draft PR #10](https://github.com/adrianhensler/splittime/pull/10)). Uses
`app/static/compare.html` and the registered corner API; not merged or deployed.
PR #10 holds the live test record. To reproduce, use
`python scripts/seed_demo.py <new-directory>` and the environment it prints,
then serve on 127.0.0.1:8100 and open `rivalry.html`.

Corner fix `c29fdcc` and process-doc PR #8 are included. UI repair `f09c3ec`
orders A/B, explains warnings and improves narrow-screen readability.
UI review is complete at `f68d70a`. Next: integrate the POC, then finish the route
summary, selected-lap analysis links and storage display. Whole-app deployed
prefix validation belongs with WP-003; authority has not expanded.

## Verification

Combined self-checks at the current application checkpoint: 223 Python and
12 Node UI tests, Ruff, packet round trip and browser rendering passed. Opus
independently reviewed the earlier integration and source page; later UI
repairs passed his `f68d70a` review. These results do not establish shared
deployment or real two-driver accuracy.

## Acceptance

Pending reviewed integration merge; full summary/storage criteria incomplete.
