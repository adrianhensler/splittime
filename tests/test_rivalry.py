"""Read-only rivalry projection: preserve uncertain outcomes and manual edits."""
from __future__ import annotations

from types import SimpleNamespace

from app.rivalry import rivalry_summary


class Stub:
    def __init__(self, sessions, laps):
        self.sessions = sessions
        self.laps = laps

    def list_sessions(self):
        return self.sessions

    def session_laps(self, session_id):
        return self.laps.get(session_id, [])


def s(sid, driver, route=17, car_class=3, pi=800):
    return {"id": sid, "driver_id": driver, "route_id": route,
            "route_name": "Example route" if route is not None else None,
            "car_class": car_class, "car_pi": pi,
            "car_ordinal": 42, "started_at": 1000.0}


def lap(lid, sid, time, flags="", excluded=False):
    return {"id": lid, "session_id": sid, "lap_number": 0,
            "started_t": 1000.0 + lid, "lap_time": time,
            "flags": flags, "excluded": excluded}


def test_two_drivers_one_route_class_yields_independent_candidate_bests():
    store = Stub([s(1, "a"), s(2, "b", pi=799)], {
        1: [lap(11, 1, 93.05), lap(12, 1, 92.44)],
        2: [lap(13, 2, 93.12)]})
    drivers = [SimpleNamespace(id="a", name="Alpha"), SimpleNamespace(id="b", name="Beta")]
    res = rivalry_summary(store, drivers)
    cat = res["categories"][0]
    assert cat["car_class_label"] == "A"
    assert cat["best_by_driver"]["a"]["lap_id"] == 12
    assert cat["best_by_driver"]["b"]["lap_id"] == 13
    assert cat["best_by_driver"]["b"]["car_pi"] == 799
    assert cat["winner"] is None and cat["ranking_state"] == "exploratory"
    assert "capture_quality_unknown" in cat["uncertainty"]


def test_provisional_rewind_contact_and_excluded_never_set_clean_best():
    store = Stub([s(1, "a"), s(2, "b")], {
        1: [lap(11, 1, 92.0, flags="cutoff"),
            lap(12, 1, 91.5, flags="rewind"),
            lap(13, 1, 91.0, flags="contact"),
            lap(14, 1, 90.0, excluded=True),
            lap(15, 1, None)],
        2: [lap(16, 2, 95.0)]})
    result = rivalry_summary(store)["categories"][0]
    assert "a" not in result["best_by_driver"]
    assert result["best_by_driver"]["b"]["time_s"] == 95.0
    assert result["winner"] is None
    states = {attempt["lap_id"]: attempt for attempt in result["attempts"]}
    assert states[11]["completion"] == "provisional"
    assert states[12]["validity"] == "suspect"
    assert states[13]["validity"] == "suspect"
    assert states[14]["validity"] == "excluded"
    assert states[15]["completion"] == "incomplete"


def test_unknown_routes_are_never_combined_across_sessions():
    store = Stub([s(1, "a", route=None), s(2, "b", route=None)], {
        1: [lap(10, 1, 90.0)], 2: [lap(11, 2, 91.0)]})
    result = rivalry_summary(store)
    assert len(result["categories"]) == 2
    assert result["unidentified_sessions"] == 2
    assert all(len(x["best_by_driver"]) == 1 for x in result["categories"])


def test_different_car_classes_get_distinct_categories():
    store = Stub([s(1, "a", car_class=3), s(2, "b", car_class=4)], {
        1: [lap(10, 1, 90.0)], 2: [lap(11, 2, 91.0)]})
    result = rivalry_summary(store)
    assert len(result["categories"]) == 2
    assert {x["car_class_label"] for x in result["categories"]} == {"A", "S1"}


def test_nonfinite_time_never_becomes_record():
    store = Stub([s(1, "a")], {1: [lap(10, 1, float("nan")),
                                       lap(11, 1, float("inf")), lap(12, 1, -10)]})
    result = rivalry_summary(store)
    assert result["categories"][0]["best_by_driver"] == {}


def test_end_to_end_two_simulated_drivers_share_route_and_api_view(tmp_path):
    """Actual packet simulator -> two independent trackers -> one SQLite -> rivalry."""
    import random

    from harness import FakeSocket
    from app.recorder.store import Store
    from app.recorder.laps import SessionTracker
    from app.telemetry.drivers import DriverScopedStore, load_drivers
    import tools.simulator as simulator

    drivers = load_drivers({"SPLITTIME_DRIVERS": (
        '[{"id":"alpha","name":"Alpha","udp_port":19999},'
        '{"id":"beta","name":"Beta","udp_port":20000}]'
    )})
    store = Store(str(tmp_path / "integrated.db"))
    store.register_drivers(drivers)
    try:
        for seed, driver in enumerate(drivers, start=61):
            random.seed(seed)
            tracker = SessionTracker(DriverScopedStore(store, driver.id))
            args = SimpleNamespace(host="127.0.0.1", port=driver.udp_port,
                                   rate=60.0, wet=False)
            sim = simulator.Sim(args)
            sim.sock.close()
            sim.sock = FakeSocket(tracker)
            sim.event(120, f"simulated {driver.id}", race_laps=1)
            sim.race_off()
            tracker.shutdown(sim.sock.t + 20.0)

        sessions = store.list_sessions()
        assert {row["driver_id"] for row in sessions} == {"alpha", "beta"}
        result = rivalry_summary(store, drivers)
        assert result["scoring"] == "exploratory_only"
        # Both used the simulator's one course and car class, so the recorder
        # should fingerprint the visits to the same physical route.
        matched = [g for g in result["categories"]
                   if set(g["best_by_driver"]) == {"alpha", "beta"}]
        assert matched, "both drivers' completed simulated laps should share a category"
        group = matched[0]
        assert group["route_id"] is not None
        assert group["winner"] is None
        assert group["ranking_state"] == "exploratory"
        assert group["total_attempts"] >= 2
        assert all(v["time_s"] > 0 for v in group["best_by_driver"].values())
    finally:
        store.close()
