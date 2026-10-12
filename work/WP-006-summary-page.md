# WP-006: Summary page and polish (M5)

| | |
|---|---|
| Status | in-progress; local comparison page implemented, full summary criteria incomplete |
| Parent | WP-000 |
| Children | none |
| Worker | Codex recovery session, 2026-10-12 |
| Verifier | Opus 5.5: application/browser review at `f68d70a`; later legend presentation fix self-checked |
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
| C3 | Analysis chart legends use line samples with the series colour and solid/dashed style | E4; browser self-check, no telemetry/timing change |

## Evidence

| ID | What | Where |
|---|---|---|
| E1 | UI regressions | `node --test tests/ui/compare.test.cjs tests/ui/rivalry.test.cjs` |
| E2 | Independent mobile-width and escaped-name browser checks | [Opus final review](https://github.com/adrianhensler/splittime/pull/10#pullrequestreview-5490170368) |
| E3 | Present page scope | `app/static/compare.html` and `app/static/js/compare.js` at `f68d70a` |
| E4 | Legend presentation follow-up to `c3ac78a` | `node --check app/static/js/analysis.js`; browser inspection of all four single-lap charts and dashed brake samples with two selected laps; `app/static/css/style.css` and shared `makeChart` legend options |

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

Later user-reported legend presentation fix: hollow square colour keys were
the chart library default, confirmed from DOM/computed styles. They now render
as line samples; dashed brake series have dashed samples. Browser checks
confirmed colours and line styles; JS syntax and diff checks passed. This new
presentation-only slice needs review in PR #10's newest head. Data and detector
code are unchanged. Refresh the page to load updated static assets.

### Two-driver Live view (2026-10-12, Opus 5.5, `feat/two-driver-live`)

Owner's request after the deployment: the Live page showed `127.0.0.1` and one
port, which fits one local user and not two remote drivers; keep live viewing,
drop the address and port, and make it work with both drivers at once. This is
the optional Live view (ADR 22). It adds nothing to this packet's acceptance
criteria, which are about the after-race summary and remain incomplete.

| # | Claim | Basis |
|---|---|---|
| L1 | The Live page shows a card per configured driver (state, speed, lap times) and no address, port or setup text | `tests/ui/liveview.test.cjs` |
| L2 | Each driver has their own same-origin socket, relative to the page and `wss` under HTTPS; one driver pausing, dropping or reconnecting does not affect the other | `tests/ui/livefeeds.test.cjs` |
| L3 | Switching the shown driver clears the gauges, histories, map, car chip and held raw values first; a late car-name reply for the previous driver is discarded | `tests/ui/liveview.test.cjs` |
| L4 | "Waiting" until a first packet; "paused" from packet arrival times. A speed or mode is shown only when it was read from the newest packets: while the tab is hidden every driver is still read about five times a second, and on return the old gauges are dropped before a current frame, if any, is shown | `tests/ui/livefeeds.test.cjs`, `tests/ui/liveview.test.cjs` |
| L5 | The server routes two simultaneous sockets to their own drivers | `tests/test_live_two_drivers.py` |
| L6 | Leaving the page closes every socket and cancels anything pending; a page restored from the back/forward cache reconnects each driver once | both UI test files |
| L7 | A failed driver-list request is shown and retried (2 s doubling to 15 s). It never becomes a single generic feed. A server that answers with an empty list still gets the one legacy feed | `tests/ui/liveview.test.cjs` |

Review round 1 (Codex, on `ca6e44a`) reproduced three faults, fixed in the
next commit: a packet arriving while the tab was hidden made a ten-second-old
frame count as current; `pagehide` stopped the feeds with no way back from the
back/forward cache; a failed driver-list request silently became one generic
"Driver" feed. L4, L6 and L7 are the corrected behaviour.

Re-run: `node --test tests/ui/*.test.cjs` and
`pytest -q tests/test_live_two_drivers.py`.

Limits: fake sockets and a fake DOM only. Not seen in a real browser, not
run against the real game, and two real drivers live at once have not been
observed. The worker could not run the Python test locally (the session's
permissions refused the virtualenv); it ran in CI. `/api/drivers` and
`/api/status` still return each driver's port to anyone who asks; the page
does not display it. Not deployed.

## Verification

Combined self-checks at the current application checkpoint: 223 Python and
12 Node UI tests, Ruff, packet round trip and browser rendering passed. Opus
independently reviewed the earlier integration and source page; later UI
repairs passed his `f68d70a` review. These results do not establish shared
deployment or real two-driver accuracy.

## Acceptance

Pending reviewed integration merge; full summary/storage criteria incomplete.
