"""Weekly recap: measured weeks from the rivalry projection, the fact-checked
column, the shared spend path and the Monday writer (ADR 35)."""
import json
import re
from datetime import date, datetime, timedelta, timezone

import pytest

from app.debrief import openrouter
from app.debrief.contracts import MODEL
from app.debrief.ledger import Ledger
from app.recap import api, auto, facts, writer

NAMES = {"a": "Captn Compass", "b": "FishFighterNS"}
MONDAY = date(2026, 10, 19)                                            # Halifax is UTC-3 that week
START = datetime(2026, 10, 19, 3, tzinfo=timezone.utc).timestamp()    # Monday 00:00 local
DAY = 86400


def lap(lap_id, driver, time_s, at, clean=True, finish="confirmed"):
    stamp = datetime.fromtimestamp(at, timezone.utc).isoformat().replace("+00:00", "Z")
    return {"lap_id": lap_id, "session_id": lap_id * 10, "started_at_utc": stamp, "finished_at_utc": stamp,
            "driver_id": driver, "driver_name": NAMES[driver], "time_s": time_s, "candidate_clean": clean,
            "finish": finish}


def group(route_id, name, label, *attempts):
    return {"route_id": route_id, "route_name": name, "car_class": 5, "car_class_label": label,
            "attempts": list(attempts)}


def season():
    before, during, after = START - DAY, START + DAY, START + 8 * DAY
    return {"categories": [
        group(1, "Ito Sprint", "S2",
              lap(1, "b", 167.13, before), lap(2, "a", 172.709, before),     # b holds it
              lap(3, "a", 162.379, during, finish="last_packet"),                   # a takes it, timed
              lap(4, "a", 170.0, during, clean=False)),                             # from the last packet
        group(2, "Daikoku Circuit", "S1",
              lap(5, "a", 62.252, during), lap(6, "a", 63.0, during + 60),   # a's first time here
              lap(7, "b", 61.0, after)),                                     # next week: not this one
    ]}


def test_a_week_is_measured_from_the_laps_that_finished_in_it():
    report = facts.build(season(), MONDAY, START + 30 * DAY)
    f = report["facts"]
    assert report["complete"] and report["week"] == "2026-10-19" and report["last_day"] == "2026-10-25"
    assert (f["laps"], f["clean_laps"], f["sessions"], f["routes"]) == (4, 3, 4, 2)
    a, b = f["drivers"]  # by name
    assert (a["driver"], a["laps"], a["clean_laps"], a["new_routes"], a["personal_bests"]) == ("Captn Compass", 4, 3, 1, 2)
    assert (a["records_held_before"], a["records_held"], b["records_held_before"], b["records_held"]) == (0, 1, 1, 0)
    assert f["contested_routes"] == 1  # Daikoku is contested only from next week
    # time provenance (AGENTS.md): an estimated finish says so wherever it is used
    assert f["personal_bests"][0] == {"driver": "Captn Compass", "route": "Ito Sprint", "class": "S2",
                                      "time_s": 162.379, "estimated_finish": True, "previous_time_s": 172.709,
                                      "previous_estimated_finish": False, "improved_s": 10.33}
    assert f["personal_bests"][1] == {"driver": "Captn Compass", "route": "Daikoku Circuit", "class": "S1",
                                      "time_s": 62.252, "estimated_finish": False}  # a first time has no "before"
    assert f["records_changed"] == [{"route": "Ito Sprint", "class": "S2", "new_holder": "Captn Compass",
                                     "previous_holder": "FishFighterNS", "time_s": 162.379,
                                     "estimated_finish": True, "previous_estimated_finish": False,
                                     "margin_s": 4.751}]
    assert "call it estimated" in writer.SYSTEM
    assert f["busiest_route"] == {"route": "Daikoku Circuit", "class": "S1", "laps": 2}  # a tie: by name
    assert report["tags"] == {"D1": "Captn Compass", "D2": "FishFighterNS",
                              "R1": "Daikoku Circuit", "R2": "Ito Sprint"}


def test_routes_are_counted_whatever_the_class_and_an_open_lap_is_in_no_week():
    """Codex, #57: a second class on a route is not a second (or new) route, and
    a lap still recording across midnight must not land in the finished week."""
    during = START + DAY
    s = {"categories": [group(1, "Ito Sprint", "S2", lap(1, "a", 160, START - DAY)),
                        {**group(1, "Ito Sprint", "A", lap(2, "a", 170, during)), "car_class": 4}]}
    open_lap = {**lap(3, "a", 150, START - 60), "finished_at_utc": None}  # started Sunday 23:59
    s["categories"][0]["attempts"].append(open_lap)
    f = facts.build(s, MONDAY, START + 30 * DAY)["facts"]
    a = f["drivers"][0]
    assert (f["routes"], a["routes"], a["new_routes"]) == (1, 1, 0)
    assert len(f["personal_bests"]) == 1  # bests stay per route and class
    before = facts.build(s, MONDAY - timedelta(days=7), START + 30 * DAY)
    assert before["facts"]["laps"] == 1  # the open lap is not counted
    open_lap["finished_at_utc"] = lap(3, "a", 150, START + 600)["finished_at_utc"]  # it finishes Monday
    assert facts.build(s, MONDAY - timedelta(days=7), START + 30 * DAY)["fingerprint"] == before["fingerprint"]


def test_weeks_run_monday_to_monday_in_local_time_and_later_driving_never_changes_one():
    # Sunday 23:30 Halifax is Monday 02:30 UTC: still the old week
    late = {"categories": [group(1, "Ito Sprint", "S2", lap(1, "a", 60, START - 1800))]}
    assert facts.weeks(late, START) == [MONDAY - timedelta(days=7)]
    s = season()
    assert facts.weeks(s, START + 30 * DAY) == [MONDAY + timedelta(days=7), MONDAY, MONDAY - timedelta(days=7)]
    before = facts.build(s, MONDAY, START + 30 * DAY)
    s["categories"].append(group(3, "Brand New Route", "A", lap(8, "b", 90, START + 20 * DAY)))
    assert facts.build(s, MONDAY, START + 30 * DAY)["fingerprint"] == before["fingerprint"]
    assert not facts.build(s, MONDAY, START + DAY)["complete"]


def test_the_facts_never_depend_on_the_order_things_are_found_in():
    """Codex, #57: two first times on one route in two classes tied in the sort,
    so hash order could reorder them and orphan a paid recap after a restart."""
    during = START + DAY
    two = {"categories": [group(1, "Ito Sprint", "S2", lap(1, "a", 160, during)),
                          {**group(1, "Ito Sprint", "A", lap(2, "a", 170, during)), "car_class": 4},
                          group(2, "Oka CCC", "A", lap(3, "b", 90, during), lap(4, "b", 91, during))]}
    flipped = {"categories": list(reversed(two["categories"]))}
    one, other = facts.build(two, MONDAY, START + 30 * DAY), facts.build(flipped, MONDAY, START + 30 * DAY)
    assert [(b["route"], b["class"]) for b in one["facts"]["personal_bests"]][:2] == [("Ito Sprint", "A"), ("Ito Sprint", "S2")]
    assert one["fingerprint"] == other["fingerprint"]


def _numbers(value, key=""):
    if isinstance(value, dict):
        for name, item in value.items():
            assert not re.search(r"\d", name), f"{name}: numbers belong in values"
            yield from _numbers(item, name)
    elif isinstance(value, list):
        for item in value:
            yield from _numbers(item, key)
    elif isinstance(value, (int, float)) and not isinstance(value, bool):
        yield key, value


def column(**changes):
    out = {"headline": "Captn Compass takes Ito Sprint", "story": "A big week.",
           "highlights": [], "next_week": "Chase it back."}
    out.update(changes)
    return out


def test_every_fact_passes_the_check_and_names_come_back_as_placeholders():
    report = facts.build(season(), MONDAY, START + 30 * DAY)
    for key, value in _numbers(report["facts"]):
        unit = "s" if key.endswith("_s") else ""
        assert writer.validate(column(story=f"It was {abs(value):g} {unit}."), report), key
    out = writer.validate(column(story="FishFighterNS lost Ito Sprint by 4.751 s; 2:42.379 is the time.",
                                 highlights=["Daikoku Circuit, 10.33 s quicker."]), report)
    assert out["headline"] == "{D1} takes {R2}"
    assert out["story"] == "{D2} lost {R2} by 4.751 s; 2:42.379 is the time."
    assert writer.validate(out, report) == out  # a cached column re-checks unchanged
    assert writer.validate(column(story="Captn Compass drove 4 laps and set 2 personal bests."), report)
    for bad in (column(story="{D2} lost by 3.9 s"),          # not measured
                column(story="{A} won"),                    # race report placeholders mean nothing here
                column(story="Their 14 laps"),              # 14 is no fact
                column(story="Fast through C4"),            # no corners in a recap
                column(story="{D1} drove 9 laps"),          # small counts are checked too
                column(story="{D1} was 7th"),             # 7 is no fact, even as an ordinal
                column(highlights=["x"] * 5)):
        with pytest.raises(ValueError):
            writer.validate(bad, report)
    assert writer.encode_request(report)  # fits the $0.01 worst-case reservation


def provider(content):
    return {"id": "receipt", "model": MODEL, "usage": {"cost": .0012},
            "choices": [{"finish_reason": "stop", "message": {"content": json.dumps(content)}}]}


@pytest.fixture
def recorded(monkeypatch):
    monkeypatch.setattr(api, "_summary", lambda store, drivers: season())


def test_a_finished_week_is_written_once_and_a_failed_one_needs_a_retry(recorded, monkeypatch, tmp_path):
    db, now, calls = Ledger(tmp_path / "debrief.db"), START + 30 * DAY, []
    monkeypatch.setattr(openrouter, "request", lambda body, key: calls.append(body) or provider(column()))
    assert api.write(None, (), db, MONDAY, "key", now=now) == "ready"
    assert api.write(None, (), db, MONDAY, "key", now=now) is False  # cached
    assert len(calls) == 1 and b"Ito Sprint" in calls[0] and b"key" not in calls[0].replace(b"_key", b"")
    report = facts.build(season(), MONDAY, now)
    assert api.view(report, db)["ai"]["narrative"]["headline"] == "{D1} takes {R2}"

    with pytest.raises(ValueError, match="once the week has ended"):
        api.write(None, (), db, MONDAY + timedelta(days=7), "key", now=START + 8 * DAY)
    with pytest.raises(ValueError, match="Monday"):
        api.write(None, (), db, MONDAY + timedelta(days=1), "key", now=now)

    nothing = MONDAY - timedelta(days=21)
    with pytest.raises(ValueError, match="Nothing was recorded"):
        api.write(None, (), db, nothing, "key", now=now)

    # a different week whose column invents a number: kept for diagnosis, never shown
    next_week = MONDAY + timedelta(days=7)
    monkeypatch.setattr(openrouter, "request", lambda body, key: provider(column(story="Won by 99.9 s")))
    assert api.write(None, (), db, next_week, "key", now=now) == "failed"
    assert db.rejected()[0]["reason"] == "Weekly recap states 99.9 s, which is not a measured fact"
    assert api.write(None, (), db, next_week, "key", now=now) is False   # no automatic retry
    monkeypatch.setattr(openrouter, "request", lambda body, key: provider(column(story="A quieter week.")))
    assert api.write(None, (), db, next_week, "key", retry=True, now=now) == "ready"


def test_the_monday_writer_sends_last_week_once_an_hour_after_it_ends(recorded, monkeypatch, tmp_path):
    db, calls = Ledger(tmp_path / "debrief.db"), []
    monkeypatch.setattr(openrouter, "request", lambda body, key: calls.append(body) or provider(column()))
    def after(monday, seconds):  # real week ends: Halifax leaves DST on 1 November
        return facts.bounds(monday)[1] + seconds
    assert auto.run_once(None, (), db, "key", now=after(MONDAY, 1800)) is None       # too soon
    assert auto.run_once(None, (), db, "key", now=after(MONDAY, 3700)) == "ready"
    assert auto.run_once(None, (), db, "key", now=after(MONDAY, 7200)) is None       # once only
    assert len(calls) == 1
    # the next week had one lap; the one after had none, so it is handled at no cost
    second, third = MONDAY + timedelta(days=7), MONDAY + timedelta(days=14)
    assert facts.bounds(second)[1] - facts.bounds(second)[0] == 7 * DAY + 3600       # 169 hours
    assert auto.run_once(None, (), db, "key", now=after(second, 3700)) == "ready"
    assert auto.run_once(None, (), db, "key", now=after(third, 3700)) is None
    assert auto.handled(db, third.isoformat()) and len(calls) == 2


def test_within_reach_lists_the_closest_records_someone_else_holds():
    report = facts.build(season(), MONDAY, START + 30 * DAY)
    # Daikoku is contested only from next week; Ito Sprint is Captn Compass's at the week's end
    assert report["facts"]["within_reach"] == [{
        "driver": "FishFighterNS", "route": "Ito Sprint", "class": "S2", "holder": "Captn Compass",
        "time_s": 167.13, "estimated_finish": False, "record_time_s": 162.379,
        "record_estimated_finish": True, "gap_s": 4.751}]
    assert report["reach_laps"] == [[1, 3]]  # the driver's best, then the record: its race report
    assert "lap" not in json.dumps(report["facts"]["within_reach"])  # lap ids are not sent as facts

    during = START + DAY
    many = {"categories": [
        group(n, f"Route {chr(64 + n)}", "A", lap(10 * n, "a", 60 + n, during), lap(10 * n + 1, "b", 60, during))
        for n in range(1, 6)] + [group(9, "Tied", "A", lap(90, "a", 70, during), lap(91, "b", 70, during))]}
    reach = facts.build(many, MONDAY, START + 30 * DAY)["facts"]["within_reach"]
    assert [(r["route"], r["gap_s"]) for r in reach] == [("Route A", 1), ("Route B", 2), ("Route C", 3)]
    assert {r["driver"] for r in reach} == {"Captn Compass"}  # at most three each; a tie is nobody's


def test_columns_written_before_within_reach_move_to_the_new_key_unpaid(tmp_path):
    report = facts.build(season(), MONDAY, START + 30 * DAY)
    # the fingerprint the previous code (#57) gave this week: the key its column is cached under
    assert report["legacy_fingerprint"] == "cd3701f922580cbd50c302f3b2aeb23b1658a59899dfd97fe0920e1258f6c6e2"
    db = Ledger(tmp_path / "debrief.db")
    old = api.cache_key(report, report["legacy_fingerprint"], 1)
    db.finish(old, db.claim(old, False), result=column(headline="Captn Compass takes Ito Sprint"),
              cost=.0012, receipt_id="r", model=MODEL)
    spent = db.budget()["used_or_reserved_usd"]
    shown = api.view(report, db)
    assert shown["ai"]["state"] == "ready" and shown["ai"]["narrative"]["headline"] == "{D1} takes {R2}"
    assert "legacy_fingerprint" not in shown and db.get(old)["state"] == "missing"
    assert db.budget()["used_or_reserved_usd"] == spent
    # routes new to the facts are numbered after the old ones, so {R2} still means Ito Sprint
    assert report["tags"]["R2"] == "Ito Sprint"
    assert "m:ss.sss" in writer.SYSTEM and "within_reach" in writer.SYSTEM


def test_a_route_only_within_reach_is_tagged_after_the_rest():
    s = season()
    s["categories"].append(group(5, "Aaa Quiet Route", "A",           # first by name, but not driven this week
                                 lap(50, "a", 61.0, START - DAY), lap(51, "b", 60.5, START - DAY)))
    report = facts.build(s, MONDAY, START + 30 * DAY)
    assert report["tags"] == {"D1": "Captn Compass", "D2": "FishFighterNS", "R1": "Daikoku Circuit",
                              "R2": "Ito Sprint", "R3": "Aaa Quiet Route"}
    assert report["facts"]["within_reach"][0]["route"] == "Aaa Quiet Route"
    out = writer.validate(column(next_week="Captn Compass is 0.5 s off Aaa Quiet Route."), report)
    assert out["next_week"] == "{D1} is 0.5 s off {R3}."
    # Codex, #59: a record set before the week appears only here, and the prompt
    # asks for lap times as m:ss.sss, so the check must read it as a lap time
    assert 60.5 not in [value for key, value in _numbers(report["facts"]) if key != "record_time_s"]
    assert writer.validate(column(next_week="Chase the 1:00.500 on Aaa Quiet Route, from 1:01.000."), report)
