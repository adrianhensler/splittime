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
