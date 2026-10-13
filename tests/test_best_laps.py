"""Owner rules of 2026-10-13: which laps may be a best, and automatic sittings."""
import pytest

from app.recorder.store import AUTO_GROUP_GAP_S, Store
from app.rivalry import rivalry_summary
from app.telemetry.packet import empty_fields, pack


@pytest.fixture
def store(tmp_path):
    s = Store(str(tmp_path / "best.db"))
    try:
        yield s
    finally:
        s.close()


def run(store, start, lap_time, covered, flags=None, route=1, car=269, driver="a"):
    """One finished single-run session whose last frame reads `covered`."""
    frame = empty_fields()
    frame.update(car_ordinal=car, car_class=3, car_pi=800)
    sid = store.create_session(start, frame, driver_id=driver)
    lid = store.add_lap(sid, 0, start, 0)
    frame["distance_traveled"] = covered
    store.add_frames(sid, [(start + lap_time, pack(frame))])
    store.complete_lap(lid, start + lap_time, lap_time, flags=flags)
    store.end_session(sid, start + lap_time, 1)
    with store.reader() as conn:
        conn.execute("UPDATE sessions SET route_id = ? WHERE id = ?", (route, sid))
        conn.commit()
    return sid, lid


def attempts(store):
    cat = rivalry_summary(store)["categories"][0]
    return cat, {a["lap_id"]: a for a in cat["attempts"]}


def test_last_packet_run_counts_only_when_it_covered_the_route(store):
    _, full = run(store, 100, 172.7, 5952, flags="cutoff")
    _, quit_early = run(store, 9000, 79.4, 4080, flags="cutoff")
    cat, by_id = attempts(store)
    assert by_id[full]["candidate_clean"] and by_id[full]["finish"] == "last_packet"
    assert not by_id[quit_early]["candidate_clean"]
    assert by_id[quit_early]["not_best_because"] == "route_not_completed"
    assert cat["best_by_driver"]["a"]["lap_id"] == full


def test_rewind_and_contact_disqualify(store):
    _, clean = run(store, 100, 60.0, 5950)
    _, contact = run(store, 9000, 50.0, 5950, flags="contact")
    _, rewind = run(store, 18000, 40.0, 5950, flags="cutoff,rewind")
    cat, by_id = attempts(store)
    assert by_id[contact]["not_best_because"] == "contact"
    assert by_id[rewind]["not_best_because"] == "rewind"
    assert cat["best_by_driver"]["a"]["lap_id"] == clean


def test_restarts_in_one_sitting_are_grouped_and_a_manual_split_sticks(store):
    a, _ = run(store, 100, 14.4, 5937)
    b, _ = run(store, 400, 14.3, 5936)
    later, _ = run(store, 700 + AUTO_GROUP_GAP_S + 1, 14.2, 5936)
    other_car, _ = run(store, 500, 14.0, 5936, car=7)
    other_driver, _ = run(store, 600, 14.0, 5936, driver="b")
    assert store.auto_group() == 2
    gid = store.get_session(a)["group_id"]
    assert gid is not None and store.get_session(b)["group_id"] == gid
    assert store.get_group(gid)["auto"] == 1
    for sid in (later, other_car, other_driver):
        assert store.get_session(sid)["group_id"] is None
    assert store.auto_group() == 0                      # idempotent
    c, _ = run(store, 700, 14.1, 5936)                  # a third restart joins
    assert store.auto_group() == 1 and store.get_session(c)["group_id"] == gid
    assert store.remove_session_from_group(c, gid)      # a person's call wins
    assert store.auto_group() == 0 and store.get_session(c)["group_id"] is None
