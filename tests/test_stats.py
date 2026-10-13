"""The stats projection: any number of drivers, same lap rule as Rivalry."""
from types import SimpleNamespace

from app.stats import stats_summary
from tests.test_rivalry import Stub, lap, s


def test_sections_count_only_valid_laps_and_rank_three_drivers():
    drivers = [SimpleNamespace(id=i, name=i.upper()) for i in "abc"]
    store = Stub([s(1, "a"), s(2, "b"), s(3, "c")], {
        1: [lap(11, 1, 60.0), lap(12, 1, 50.0, flags="contact")],
        2: [lap(13, 2, 59.0), lap(14, 2, 58.0), lap(15, 2, 58.5)],
        3: [lap(16, 3, 61.0, flags="rewind")]})
    for row in store.sessions:
        row.update(ended_at=row["started_at"] + 300, lap_count=1, route_kind="circuit")
    out = stats_summary(store, drivers)
    assert out["totals"] == {"sessions": 3, "laps": 6, "valid": 4, "routes": 1}
    sections = {sec["id"]: sec for sec in out["sections"]}
    board = sections["leaderboard"]["tables"][0]
    assert board["rows"][0][:3] == ["B", 1, 1]          # holds the contested best
    assert [row[0] for row in board["rows"]] == ["B", "A", "C"]
    bests = sections["bests"]["tables"][0]["rows"][0]
    assert [c and c["value"] for c in bests[2:5]] == [60.0, 58.0, None]  # contact, rewind out
    assert out["scoring"] == "exploratory_only"
    assert bests[5] == "B" and bests[6] == 2.0
    consistency = sections["consistency"]["tables"][0]["rows"]
    assert consistency[0][2] == "B" and consistency[0][3] == 3
    earned = {row[0]: row[2:] for row in sections["goals"]["tables"][1]["rows"]}
    assert earned["On the board"] == ["Earned", "Earned", "—"]
    assert earned["Record holder"] == ["—", "Earned", "—"]


def test_empty_database_has_no_tables():
    out = stats_summary(Stub([], {}))
    assert out["totals"]["laps"] == 0
    assert all(not sec["tables"] for sec in out["sections"])


def test_identical_bests_are_a_tie_and_unknown_metadata_is_not_counted():
    drivers = [SimpleNamespace(id=i, name=i.upper()) for i in "ab"]
    imported = s(3, "a", route=None, car_class=None)
    imported["car_ordinal"] = None
    store = Stub([s(1, "a"), s(2, "b"), imported], {
        1: [lap(11, 1, 60.0)], 2: [lap(12, 2, 60.0)], 3: [lap(13, 3, 70.0)]})
    for row in store.sessions:
        row.update(ended_at=row["started_at"] + 300, lap_count=1, route_kind="circuit",
                   conditions="snow" if row["id"] == 2 else None)
    out = stats_summary(store, drivers)
    sections = {sec["id"]: sec for sec in out["sections"]}
    board = {row[0]: row for row in sections["leaderboard"]["tables"][0]["rows"]}
    assert board["B"][1:3] == [0, 0]                     # tied: nobody holds it
    assert board["A"][1:4] == [1, 0, 1]                  # only the unopposed import
    tie = next(r for r in sections["bests"]["tables"][0]["rows"] if r[0] == "Example route")
    assert tie[-2:] == ["Tie", 0.0]
    record = [t for t in sections["head_to_head"]["tables"] if t["title"].startswith("Record")]
    assert not record                                    # no wins either way
    totals = {row[0]: [c["value"] for c in row[1:]]
              for row in sections["overview"]["tables"][0]["rows"]}
    assert totals["Routes with a valid time"] == [1, 1]  # the unknown route is not a route
    assert totals["Cars with a valid time"] == [1, 1]
    weather = {row[0]: row[1:] for row in sections["events"]["tables"][2]["rows"]}
    assert weather["snow"] == [0, 1]


def test_a_last_packet_best_keeps_its_marker():
    drivers = [SimpleNamespace(id="a", name="A")]
    store = Stub([s(1, "a")], {1: [lap(11, 1, 60.0)]})
    store.sessions[0].update(ended_at=1300.0, lap_count=1, route_kind="sprint")
    import app.stats as stats
    original = stats.rivalry_summary
    def marked(*args):
        out = original(*args)
        out["categories"][0]["attempts"][0]["finish"] = "last_packet"
        return out
    stats.rivalry_summary = marked
    try:
        out = stats_summary(store, drivers)
    finally:
        stats.rivalry_summary = original
    row = {sec["id"]: sec for sec in out["sections"]}["bests"]["tables"][0]["rows"][0]
    assert row[2] == {"kind": "time", "value": 60.0, "est": True}
