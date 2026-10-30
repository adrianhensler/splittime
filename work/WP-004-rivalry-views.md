# WP-004: Rivalry views (M3)

## Within reach in the weekly recap (ADR 37), 2026-10-30

Recap facts gain `within_reach` (up to three per driver: records someone else
holds at the week's end, closest first, with provenance) and `reach_laps`
outside the facts; the page lists them with "Where the gap is" (that pair's
race report) and Replay links. Prompt v2 asks for m:ss.sss lap times and
aims `next_week` at the closest record. Cached v1 columns are adopted: the
report carries the v1 fingerprint (pinned in a test to the value the #57
code gives) and `api.adopt` rekeys; new route tags are numbered after the
old ones. On a copy of the live data: both written columns (12 and 19 Oct)
moved, budget unchanged at $0.062843; e.g. the 19 Oct week lists Captn
Compass 0.296 s off FishFighterNS on Narai-Juku S2, and its link opened that
race report in headless Chromium. Tests: `tests/test_recap.py` (3 new),
`tests/ui/recap.test.cjs` (1 new). The real model has not yet written a
column under prompt v2; the next one is this week's, on 2 November.
Codex on #59 (P2): the record time was `record_s`, and the check reads only
`*time_s` fields as m:ss.sss lap times, so a column following the prompt
("2:42.379") would fail and be hidden after being paid for. Renamed to
`record_time_s`; a test writes a pre-week record that appears only in within
reach as m:ss.sss, and fails with the old name.

## Refresh offer when results change (ADR 36), 2026-10-30

Owner: pages do not update after a race, without loading the server. New
`GET /api/changes` (`app/changes.py`) hashes what the result pages read,
leaving out frames and anything still recording; `js/updates.js` on the
seven result pages reads it on load, then once a minute while visible, and
shows a Refresh / Later bar when it differs. Tests: `tests/test_changes.py`
(recording frames and an open lap do not move the token, a finished lap,
edit, rename or finished report does; a poll never creates the ledger) and
`tests/ui/updates.test.cjs` (baseline, hidden tabs, throttle, Later).
About 4 ms per request on a copy of the live data.
Codex on #58 (P2): if the first check failed, a later token was taken as the
baseline, so a race finishing in between was never offered. Now the first
token after a failed start offers a refresh ("Results may have changed").
Second pass (P2): a race finishing between the page's results read and its
first token read was adopted silently. `updates.js` now loads in <head> and
holds the page's own `api/` requests until the first token is in (at most
2 s; past that the first token offers a refresh instead). Tested with a fake
page (results wait; slow baseline lets them through and shows "may have"),
and in headless Chromium: the server log shows `api/changes` before
`api/rivalry`, and the bar appears after a rename.

## Then vs now and the weekly recap (ADR 35), 2026-10-29

Owner asked for historical reporting for engagement and insight. Then vs now
is a `progress` mode of the race report (same facts and check; one driver's
first clean run as B, best as A; own prompt, schema and cache key), shown in
a new Rivalry section with a driver picker (`RivalryModel.progress`). The
weekly recap (`app/recap/`) measures Halifax weeks from the rivalry
projection, writes a fact-checked column with names as {D1}/{R1}
placeholders, and a 30-minute pass writes last week's once, an hour after it
ends. The race report checker now takes a placeholder set and a label, and
reads any `*time_s` as a lap time. New Recap page, linked from every page's
menu; What's new entry added.

Checked locally on a snapshot of live data (no API key, nothing spent):
three weeks measured (48, 32 and 18 laps so far), e.g. the 19 Oct week shows
Captn Compass taking Ito Sprint S2 by 4.751 s and 10.330 s off their own best;
14 real then-vs-now pairs; a two-driver pair is refused (409); headless
Chromium screenshots of Recap and Rivalry render as intended. Suite 368
passed, UI 111 passed, Ruff clean. AI columns themselves are untried against
the real model; the first ones are written after deploy, through the ledger.
Codex on #57: (P1) recap facts dropped time provenance; bests and record
changes now carry `estimated_finish` / `previous_estimated_finish`, the page
marks them "est." and the prompt says to call them estimated. (P2) the bests
sort had ties, so hash order could change a finished week's fingerprint; it
is now a total order (and the busiest route breaks ties by name), tested by
building a week from reversed categories. (P1) DESIGN.md scope now lists
then vs now and the weekly recap.
Second Codex pass: (P1) the then-vs-now summary line now says "(estimated)"
after a last-packet time. (P2) the check's free pass for whole numbers up to
10 suits race reports (gears, ordinals) but not a recap made of counts; it is
now a parameter, off for recaps, so "drove 9 laps" fails unless 9 is measured.
Third pass (both P2): routes and new routes are counted per route, not per
route and class, as on Stats; and a lap still recording (no finish time) is
in no week until it finishes, so it cannot move a finished week's facts. All
237 live laps have a finish time, so nothing recorded is left out.

## Race report fact check: the "250 m" rejections, 2026-10-28

Live logs showed every recent review rejected with "states 250 m, which is not
a measured fact": the number lived only in the key `first_250m_s`, which the
check never read. PR #55 (merged `88737b2`, website rebuilt, collector
untouched) reads metres in a key name; the two failed pairs (223 vs 174,
210 vs 186) were retried and now pass. PR #56 adds a test that states every
fact plainly and requires the check to pass it (fails with the original error
when #55 is undone), logs an automatic report that failed its check as failed
instead of "written", and keeps the newest 50 rejected answers with their
reason in the ledger. Owner review: reading numbers out of key names is the
wrong fix, so #56 instead makes the launch two values (`first_stretch_m`,
`first_stretch_s`), drops the key parsing and asserts no digits in fact names.
Cached reviews are kept: the old-shape fingerprint finds them and `rekey`
moves them, no call. Checked on a snapshot of live data: all 5 reviews the
deployed code can reach match; 4 older rows were already unreachable.
Codex (P2): a call in flight during a rekey finished against the old key and
its paid answer was dropped; `finish` now finds the row by its call ID.
Not user-visible.

## Session review moves to Analysis, 2026-10-26

The owner found two AI reviews under "A vs B analysis" confusing (race report
and session debrief) and agreed to move the session one. Branch
`feat/debrief-in-analysis`: Rivalry keeps only the race report (no
`#st-debrief`, no `debrief.js`; Analyse with only A no longer opens anything;
the analysis note points to Analysis for whole sessions). Analysis gets a
"Session review" panel under the lap comparison, `js/debrief.js` unchanged in
behaviour, mounted with each detail pane and given the tray's first two picks
(A = reference, B = second pick if any) on every tray change. New
`css/debrief.css` scopes its styles to that panel in Analysis's palette.
Wording: "Session review", "AI priorities", and no "counted separately above"
(that referred to Rivalry). UI suite 106 passed (new placement test).
Headless Analysis check with the debrief API answered in the browser: opening
a session fills the panel from the tray (`?lap_a=186`) and renders in the
page's styling. What's new entry added.
Codex (two P2): (1) a tray with laps on different or unknown routes made
the server refuse the whole review (409), A's own stats included; B is now
passed only when both picks share a known `route_id`, else A is reviewed
alone. (2) After a lap edit `reloadSession()` re-rendered with the same lap
IDs, so the review kept stale measurements; it now calls `reviewContext(true)`
to reload them. Test runs `reviewContext` itself for same / other / unknown
routes and the refresh flag. UI suite 107 passed.
## At most two report builds at once, 2026-10-26

Follow-up to the 5.5 GB incidents (see the shareable-link checkpoint below):
cancelled `GET api/race-report` requests kept computing. Branch
`fix/limit-report-builds` adds `app/heavy.py`: the race report and debrief
GETs are async and run their build in a worker thread behind one per-app
semaphore of `MAX_BUILDS = 2`. Errors raised in the build (404/409) still
reach the caller. The gateway's 1 GB cap stays as the outer guard.
Codex (P2): the first version skipped queued requests whose caller had
disconnected, but behind `create_app`'s `@app.middleware("http")` wrappers
`request.is_disconnected()` never sees the disconnect. Replaced, without
relying on disconnects: identical requests in flight (same endpoint and laps)
share one build (`asyncio.shield`, so one caller leaving does not cancel it);
at most `MAX_PENDING = 6` different builds wait or run, past that 503 with
`Retry-After: 2`. Tests: `tests/test_heavy.py` (peak 2 of 6; 60 requests for
two pairs = 2 builds; the cap and an identical request still joining; errors
reach every caller) and an integration test through the real app and its
middleware with lifespan (12 concurrent GETs for one pair = 1 build, all 200).
Full suite 358 passed, Ruff clean.

## Shareable race report link, 2026-10-26

The owner could not share the race report he was reading. Branch
`feat/share-pair-link`: Rivalry keeps `?laps=a,b` in the address while a pair
is selected (replaceState, keeping the hash), instead of dropping it after
arrival; a link selects the pair and opens its report. The pair strip has a
Copy link button on Rivalry and Traces & corners (Replay keeps its own),
copying the absolute address, or saying "Copy the address bar" without a
clipboard. UI suite 102 passed. Headless check with the report API stubbed in
the browser: a cold `?laps=174,98#st-analysis` load makes one report request
and shows the review; Copy link copies that address; picking B = 22 makes one
request and the address becomes `?laps=174,22`.
Incident while testing: an earlier headless script used a self-invalidating
selector ("first unchecked B radio") that flipped B between 98 and 22 about
60 times; every cancelled `api/race-report` request kept computing on the
server (about 80 MB each), taking the web container to 5.5 GB twice and
swapping the host. Not a page bug. Gateway PR caps the web container at 1 GB;
limiting concurrent report builds is a separate follow-up.
Codex (P2): with the pair now always in the address, a reload looked like an
incoming link and cleared the restored search. Fixed: the search is cleared
only when it would hide one of the linked laps; regression test added
(UI suite 103 passed).
Codex (second P2, same cause): a reload also skipped the identity checks
that reject a reused lap ID. Fixed at the root: when the address names the pair
this tab already saved, it is a restore (saved search, identity checks), not
an incoming link; only a different pair goes through arrival. Tests for both:
reused ID on reload falls back to the defaults; a link to another pair keeps a
compatible search and clears a hiding one. UI suite 104 passed.
Codex (third P2): a Race report link back to the tab's own pair restored it
but left the report closed. `#st-analysis` in the address now opens the report
on first load whether the pair was linked or restored; plain reloads and later
refreshes do not. UI suite 105 passed.

## Menu and What's new, 2026-10-26

Owner's choices: Rivalry_legacy leaves the site menu (still linked from
Rivalry's footer, and keeps its own entry on its own page), Analysis stays.
Branch `feat/nav-whats-new`: every page's menu is Live · Analysis · Rivalry ·
Replay · Stats · How it works · What's new. New `whats-new.html` (docs
styling) lists user-visible changes in plain language, newest first; the
owner asked for it because the repository is private. Every later
user-visible PR adds its entry there. UI suite passed; headless render of the
new page checked.
## One pair, three views: the pair bar, 2026-10-26

The owner found Rivalry, the race report, Compare and Replay "a bunch of random
interfaces": Compare linked only back to Rivalry and Analysis, Replay was in no
menu and linked nowhere, and the same pair had two URL shapes. Branch
`feat/pair-bar` adds `js/pair-bar.js` + `css/pair-bar.css`: one strip (route,
both drivers and times with est., then Race report / Traces & corners / Replay,
swap A and B, back to Rivalry) on `compare.html` (now with the site header),
`replay.html` (when exactly two laps are replayed) and Rivalry's analysis
section. Every pair link is `?laps=a,b`; compare.js still reads `lap_a/lap_b`.
Rivalry selects a linked pair once, opens its report and drops the parameter.
Row/inspector links are renamed to the same three names. No API or recording
change. UI suite: 101 passed (new pair-bar tests, arrival test, compare
`?laps=`). Headless round trip over live data (worktree static files, live
API): Traces → Replay → Race report → Traces kept 174 vs 98 throughout. Next
slice: nav (Replay in, Rivalry_legacy out) and an in-app What's new page.

## Review first in the race report, 2026-10-26

Merged #48 deployed (6ce6041). The owner's Retry on 174 vs 98 passed the fact
check ($0.0048), so that earlier rejection's reason stays unknown. The owner
could not find the written review: it sat below the measured sections, under
the same look as them. Branch `fix/race-review-first` puts a "Race engineer's
review" block directly under the headline (narrative, or the write button and
its status), drops the button once a review is stored, names the panel
"Race report & engineer's review", and replaces "Management login required"
with "needs a signed-in SplitTime account" in the race report and debrief.
Not auto-opened on selection: the measured GET takes about 3 s per pair on a
public page. UI suite: 95 passed; headless render of 174 vs 98 against live
data shows the review above "Where the time went".

## First automatic pass, and logging why a narrative is rejected, 2026-10-25

After deploy (53b0c55) the first pass wrote all 5 takeovers at about $0.005
each (estimate was $0.0015): 98 vs 21, 88 vs 14 and 82 vs 20 passed the fact
check; 174 vs 98 and 92 vs 66 failed, and nothing records why. Branch
`fix/race-report-rejection-reason` logs the fact check's own reason (for
example "states 99.9 s, which is not a measured fact"); provider and network
errors are logged by type only. Next: one owner Retry on 174 vs 98 to read the
reason, then tune the checker or the prompt. Not independently verified.

## Automatic race report on a change of record holder, 2026-10-25

Branch `feat/auto-race-report`: `app/racereport/auto.py` runs in the web role
every 5 minutes and writes the race report for each takeover of the last 14
days (new record as A, the record it beat as B) through `api.write`, the path
the button now shares; ADR 34 (Proposed). At most 20 automatic calls per UTC
month, recorded in `auto_reports` in the ledger file; no automatic retries;
open sessions wait. On a copy of the live database it finds the same 5
takeovers as the banner, all eligible. Self-checks: 2 new pytest (detection;
a pass with cap, skips, waits and budget stop), race report tests unchanged.
Not tested: a real provider call from the loop. Not independently verified.

## Takeovers banner and scoreboard, 2026-10-25

Owner asked to surface recent wins and takeovers. Branch `feat/takeovers-banner`
adds a strip above the Rivalry table, computed on the page from `api/rivalry`
(no server change): the latest lead change, a scoreboard (groups each driver
leads, unanswered groups, closest gap), and the four newest improvements, each
with Open (selects the group, new time as A against the rival's best as B) and
Replay. A takeover is any change of record holder, including a first answer
that beats the only time; the history table's "Took recorded lead" still needs
both drivers to have a time, so the banner finds 5 takeovers in the live data
where the table marks 1. Self-checks: 89 UI tests (2 new), rendered from a
copy of live `api/rivalry`. Not checked in a real browser. Not independently
verified.

## A vs B analysis section, 2026-10-25

Owner could not find the debrief: it was a collapsed one-line `<details>` in
12px grey text below the history table. Branch `feat/analysis-section` puts
the race report and session debrief under one "A vs B analysis" heading that
names both laps, at body text size; "Analyse A vs B" is now the inspector's
primary button and each contested table row has an Analyse link (its two
bests, leader as A). Both open the race report and scroll to it. The
write-access message now says an account with SplitTime access is needed (the
owner was signed in but not allowlisted, and was told to sign in). 93 UI tests
(1 new). Correction to the race report checkpoint below: "4.3–5.1 km" was the
game's route units; in metres that section runs 6.6–7.9 km (Ito Sprint is
9.2 km). Not checked in a real browser. Not independently verified.

## Race report checkpoint, 2026-10-25

Owner asked for a racer-style review of an A/B pair. Branch `feat/race-report`
adds `app/racereport/` (section facts, fact-checked narrative, API) and a Rivalry
panel; ADR 33 (Proposed). Self-checks: 347 pytest (6 new, on simulator
recordings), 91 UI tests (4 new), ruff clean. On a copy of the live database,
laps 98 vs 174 give 7 sections with section 6 (4.3–5.1 km) costing A 2.252 s,
C19 in 3rd against 5th, and on/off inputs for B, matching a manual analysis;
the request is 7,972 bytes, within the $0.01 reservation. Not tested: a real
provider call. Whether Gemini's prose passes the number check often enough is
unknown until a signed-in generation. Not independently verified.

Owner then asked for gamertags instead of anonymous drivers ("I want to know
who I am racing"). The writer now receives the configured gamertags and the
server stores them as {A}/{B} before the number check (a digit in a gamertag
is never read as a measurement); one driver's two runs are "name (A)/(B)".
349 pytest, 91 UI, ruff clean; 98 vs 174 request is 8,078 bytes (worst case
$0.0098).

## Replay and compare from the Rivalry table, 2026-10-25

Owner asked for one click from a rivalry row to the A/B replay. PR #42 (branch
`feat/rivalry-row-replay`) adds Replay and Compare links to the gap cell of every
row where two drivers have a best, leader as A; solo rows and the inspector are
unchanged. Self-checks: 87 UI tests (one new), 60 API tests. Codex review: no
findings. Not independently verified.

## Debrief for full-route sprints, 2026-10-25

Owner asked for corner priorities on sprints, which always end on the last
packet. PR #41 (branch `fix/debrief-full-route-sprints`) requires only
`candidate_clean` (which already includes ADR 30's full-route test) and warns
when a finish is estimated. ADR 32 updated. Self-checks: 341 pytest, ruff clean;
on a copy of the live database, laps 98 vs 174 return coaching with C15 −0.481,
C19 −0.420, C16 −0.410, C12 +0.340, C3 +0.251 and C22 +0.248 s, matching a manual
trace analysis. Codex review: no findings. Not independently verified; AI
generation on a sprint pair still untested live.

## Session debrief checkpoint, 2026-10-13

**Admission/deployment update:** GPT-6 Astra independently reviewed final
`07b2626`, ran 14 targeted Python and 4 debrief UI tests, validated hosting
Compose/gate and merged PR #37 after CI test/UI/records passed. Merge `2e325f5`;
companion site PR #120 merge `9fda383`. Both deployed at 2026-10-14T02:55Z.
This supersedes pending merge/deployment statements below and admits only the
bounded debrief, not official ranking or coaching accuracy.

Live public browser shows actual session 19 / laps 20 vs18, raw recorded
difference 0.437 s, C3 gain 0.319 s and C7 loss 0.264 s. Anonymous AI generation
preserves measurements and asks for management login. Gateway probes: missing/
cross-origin POST 403, valid-origin anonymous POST 302, public measured GET 200.
Server key accepted by OpenRouter's read-only key endpoint; ledger integrity ok,
zero live calls. Actual signed-in live inference remains untested. Optional
internal operator smoke call was rejected by automatic approval review because
it would bypass external login, and was not executed. Real synthetic provider/
browser checks below passed. Next field checkpoint: ordinary signed-in AI
generation, then assess usefulness after a drive.

Collector identity/start, all 29 other containers and hashes of all 17 closed
sessions/laps/edits/frames match predeployment. Hosting record holds backup and
rollback receipt. No collector restart or additional infrastructure.

Checkpoint owner: Codex. Branch `feat/session-debrief`, based on main `d6de7a6`.
PR locator: [PR #37](https://github.com/adrianhensler/splittime/pull/37),
implementation head `7fb4580`. This bounded slice does not complete the original
ranked-rivalry or real two-driver acceptance criteria below.

Claims: closed A-session statistics and B-reference differences are computed
locally; eligible full-route estimates retain best eligibility but not confirmed
consistency/corner evidence. Own progress requires known matching driver, route,
car and PI before this session. Gemini chooses allowlisted facts and one practice
hypothesis; the app writes all numeric explanations from validated measurements.
Anonymous numeric facts only leave the server. Public GETs never invoke AI.
Persistent separate cache/ledger protects $1/UTC month with atomic $0.01
reservations, deduplication, explicit retry and retained ambiguous charges.
No telemetry schema, recorder, collector or gateway change.

Worker evidence: full `python -m pytest -q` 340 passed; final affected
`python -m pytest -q tests/test_debrief.py` 14 passed; `node --test
tests/ui/*.test.cjs` 78 passed; `ruff check .`, packet round-trip and diff checks
passed. Fresh temporary test directory is required on Windows. Tests cover
manual edits, full-route/short cutoff, B-only estimate labels, unknown car/PI,
source changes during inference, strict privacy/contract, duplicate concurrent
claims, restart/UTC month, ambiguous charges, cap breach and cached no-call reads.
Node checks cover collapsed/no-call behaviour, late responses, escaped strings,
auth error preserving measurements and explicit retry. Existing prefix tests pass.

Actual synthetic OpenRouter call returned `google/gemini-3.8-flash`, valid strict
JSON, known $0.000414 charge; repeat claim produced no new call. Initial 45 s
timeout kept its $0.01 reservation; standard Vertex route then succeeded.
Actual loopback `/splittime/` browser preview expanded measurements and generated
cached Gemini priorities for $0.00038. Simulator clocks/capture quality correctly
withheld corner priorities; no simulated evidence is called field accuracy.

Independent draft reviewer: GPT-6 Astra (implementer GPT-6.1 Sol). Its two P2
findings, B estimate provenance and unknown car/PI matching, are fixed with
regressions. Independent final-head review/CI merge remains pending.
Acceptance: pending reviewer merge. Deployment: not yet done. Remaining unknowns:
actual authorized/unauthorized gateway flow, live provider latency/availability,
coaching usefulness and racing causality. Gateway auth is external; the app must
remain internal. Weekly telemetry backup does not yet include `debrief.db`.
Preserve/back up that ledger; never restore an older one within the same month
with AI enabled. Next: open PR, pin final-head review, merge green CI, update only
the existing website container and verify live reads/auth/cache; preserve collector
identity, closed recording hashes and capture backups.

| | |
|---|---|
| Status | partial original scope; session debrief slice reviewed, merged and deployed |
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
- Owner, 2026-10-13: add the expandable session debrief with optional OpenRouter
  Gemini 3.8 Flash priorities and the described $1/UTC-month cap. Anonymous
  derived statistics only; existing web service/gateway; no collector restart,
  new VPS, raw-packet cloud transfer or automatic generation.

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

## Deployment and Back-navigation follow-up, 2026-10-13

GPT-6 Astra final-head reviewed `38849b6` and merged PR #23 after CI runs 77
and 78 passed, admitting the exploratory v2 slice at `046185c`. Gallery PR #117
merged at `45e478c`. Both versions and both gallery cards are live. Existing
web container alone was rebuilt; collector identity/start time and 29 other
containers were unchanged. Previously closed recordings' frame/row hashes
match. Backup/receipt details are in the hosting record.

Live browser self-checks: 11 attempts across four route/classes; actual route
outlines; local-date search narrowed to Narai-Juku S2; improvement filter 6 to
4; selected laps 20/18 showed 0.436 s and loaded speed/throttle/brake overlays
and eight corner rows through the existing prefixed comparison page. Both
gallery cards were visibly present. These checks do not validate competitive
equivalence or coaching accuracy; no management request was made.

That end-to-end check reproduced a Back-navigation defect: native browser form
restoration showed the prior filter while the JS model and lap choices reset.
Repair [PR #24](https://github.com/adrianhensler/splittime/pull/24), branch
`fix/rivalry-v2-return-state`, source head `da4f184`, based on merged main, retains
route/search/history and full lap identities in per-tab session storage.
It restores them only against fresh API data, resetting reused lap identities;
pageshow synchronizes native controls and refreshes a cached page. Blocked
storage falls back to functional defaults. No recording or scoring change.
Worker Node suite: 62 passed and Ruff passed; new regression simulates returning
from comparison and reprocessed/reused IDs. Actual local browser Compare/Back
retained search “Porsche”, improvements filter, 4 of 6 attempts and selected
pair 2/1. Re-run `node --test tests/ui/*.test.cjs`; browse the prefixed local
web-only app, set search/filter/A-B, open Compare, press Back and verify the
same filter, row count and pair. Astra review and the deployed browser recheck
are pending in the PR; they are not asserted here. Next: review,
merge green CI, update only the existing web service, and verify the actual
Back flow. Full M3 competitive/real-two-driver acceptance remains partial.
