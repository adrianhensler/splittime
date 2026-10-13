# WP-008: Best-lap rules, automatic sittings, collapsed laps

| | |
|---|---|
| Status | in review |
| Parent | none |
| Children | none |
| Worker | Claude |
| Verifier | Codex (review as it goes, full review at the end) |
| Acceptor | owner |

## Intent

First user feedback (2026-10-13): "what does the merge do?", and an hour of racing leaves a lot
to go through. The site exists to track each driver's best valid times, compared the way the
game compares them. Two drivers today; nothing new may assume exactly two.

## Outcome

- A lap counts as a best when it has no rewind, no contact and is not excluded. A run timed from
  the last packet (`cutoff`) counts only when it covered the whole route, and is marked "est.".
- Restarts of one event in one sitting are grouped by the recorder; a manual split is remembered.
- Rivalry shows each driver's best per route and class, other laps one click away, and the same
  route's bests by car and overall beneath.

## Authority and limits

Owner decisions of 2026-10-13, recorded in the pull request. For this run the owner asked the
author to merge here, with Codex reviewing as it goes. No deployment, no change to live recordings.

## Acceptance criteria

1. Ito Sprint's two full-route last-packet runs can be a best; a 4080-unit abandoned run cannot.
2. Contact and rewind laps never become a best; a dismissed contact no longer counts against a lap.
3. Three restarts within two hours form one group; a session removed by hand stays out.
4. The Rivalry page opens on best times and offers "Show N other laps".

## Context

`app/rivalry.py` (rule, `lap_covered`, `FULL_ROUTE_UNITS`), `app/recorder/store.py`
(`auto_group`, `AUTO_GROUP_GAP_S`), `app/recorder/laps.py` (call at session close),
`app/static/js/rivalry-v2*.js`, `tests/test_best_laps.py`, `tests/ui/rivalry-v2.test.cjs`.

Evidence: over every lap in the live database on 2026-10-13 a completed lap or run covered
5934-5960 odometer units; the two abandoned runs covered 2483 and 4080.

Event modes (race / rivals / drift) are still counted together with the guess shown. Telling
them apart is an open review item, waiting on kept captures of each mode.
