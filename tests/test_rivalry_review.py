"""PR #7: immutable cutoff evidence survives edits; names share the catalogue."""
from types import SimpleNamespace

import pytest

from app.api.routes import LapPatch, patch_lap, sessions
from app.recorder.store import Store
from app.rivalry import rivalry_summary
from app.telemetry.packet import empty_fields


@pytest.fixture
def recording(tmp_path):
    store = Store(str(tmp_path / "review.db"))
    frame = empty_fields()
    frame.update(car_ordinal=269, car_class=3, car_pi=800)
    sid = store.create_session(10, frame)
    lid = store.add_lap(sid, 0, 10, 0)
    store.complete_lap(lid, 40, 41.599998474121094, flags="cutoff")
    req = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(store=store)))
    try:
        yield store, sid, lid, req
    finally:
        store.close()


def test_clearing_detector_cutoff_cannot_promote_estimated_best(recording):
    store, sid, lid, req = recording
    patch_lap(lid, LapPatch(flags=""), req)
    lap = store.session_laps(sid)[0]
    assert not lap["flags"] and lap["flags_auto"] == "cutoff"
    group = rivalry_summary(store)["categories"][0]
    attempt = group["attempts"][0]
    assert attempt["completion"] == "provisional"
    assert attempt["timing_source"] == "cutoff_estimate"
    assert not attempt["candidate_clean"]
    assert group["best_by_driver"] == {}
    assert attempt["time_s"] == 41.6


def test_car_name_matches_session_view_and_override(recording):
    store, _, _, req = recording
    group = rivalry_summary(store)["categories"][0]
    expected = sessions(req, driver_id=None)[0]["car_name"]
    assert expected == "1987 Porsche 959"
    assert group["attempts"][0]["car_name"] == expected
    with store.reader() as conn:
        conn.execute("INSERT INTO car_names VALUES(269, 'Custom 959')")
        conn.commit()
    assert rivalry_summary(store)["categories"][0]["attempts"][0]["car_name"] == "Custom 959"


def test_unknown_effective_flag_cannot_be_a_clean_candidate(recording):
    store, sid, _, _ = recording
    with store.reader() as conn:
        conn.execute("UPDATE laps SET flags='new_detector_flag' WHERE session_id=?", (sid,))
        conn.commit()
    group = rivalry_summary(store)["categories"][0]
    assert group["attempts"][0]["validity"] == "suspect"
    assert group["best_by_driver"] == {}


@pytest.mark.parametrize("ordinal,override,expected", [
    (None, None, "Unknown car"), (None, "Imported car", "Imported car"),
    (999999, None, "Car #999999"), (269, "Override", "Override"),
])
def test_shared_car_fallbacks(ordinal, override, expected):
    from app.cars import resolve_name
    assert resolve_name(ordinal, override) == expected
