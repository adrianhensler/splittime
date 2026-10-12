# WP-006: Summary page and polish (M5)

| | |
|---|---|
| Status | in-progress; local comparison page implemented, full summary criteria incomplete |
| Parent | WP-000 |
| Children | none |
| Worker | Codex recovery session, 2026-10-12 |
| Verifier | — |
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

| # | Claim | Basis |
|---|---|---|

## Evidence

| ID | What | Where |
|---|---|---|

## Known, unknown, unproven

- **Known:** the browser can follow the rivalry candidate pair to three trace
  overlays and the corner table in a simulator-only local demo.
- **Unknown:** real-capture accuracy, deployed gateway and URL-prefix behaviour.

## Unresolved

Per-driver storage display, links that select each lap in the full analysis
page, and a complete route summary are not done. Numbering changes when the
reference lap changes. New upstream-branch fixes must be reviewed before merge.

## Checkpoint

Implementation at `3ed8f6c` on `feat/codex-integrated-poc`
([draft PR #10](https://github.com/adrianhensler/splittime/pull/10)). Uses
`app/static/compare.html` and the registered corner API; not merged or deployed.
PR #10 holds the live test record. To reproduce, use
`python scripts/seed_demo.py <new-directory>` and the environment it prints,
then serve on 127.0.0.1:8100 and open `rivalry.html`.

Next: fetch and compare `origin/feat/opus-corner-analysis` with this integration.
The recovery session observed new fix `c29fdcc` (clock resets and route-equivalence
warnings), not yet included in PR #10. Also inspect pending process-doc PR #8
before changing shared rules. Then review the integrated POC without expanding
deployment authority.

## Verification

Self-checks: 8 UI controllers, Ruff, browser rendering and corner API requests
against simulator recordings. Combined Python suite 205 passed before the final
driver-label addition, then 31 corner and 21 driver/rivalry regressions passed.
No independent review of this session's newly authored integration yet.

## Acceptance

—
