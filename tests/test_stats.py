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
    assert bests[2:5] == [60.0, 58.0, None]              # contact and rewind laps are out
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
