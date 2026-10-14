"""Debrief arithmetic, source quality, anonymous model contract and durable spend."""
import copy
import json
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.debrief import api, openrouter, summary
from app.debrief.contracts import MODEL, anonymous_facts, validate
from app.debrief.ledger import CALL_LIMIT, MONTH_LIMIT, BudgetError, Ledger
from app.main import create_app


def lap(lid, sid, seconds, flags="", **extra):
    return {"id": lid, "session_id": sid, "started_t": 1000 + lid, "ended_t": 1100 + lid,
            "start_distance": 0, "lap_time": seconds, "flags": flags, "flags_auto": flags,
            **extra}


class Source:
    def __init__(self, path):
        self.db_path = str(path)
        self.sessions = {sid: {"id": sid, "route_id": 7, "car_ordinal": 42, "car_pi": 800,
                              "car_class": 3, "driver_id": "PRIVATE DRIVER", "source_addr": "PRIVATE IP",
                              "started_at": start, "ended_at": start + 100}
                         for sid, start in ((1, 800), (2, 1000), (3, 1200))}
        self.laps = [lap(1, 1, 62), lap(2, 2, 61), lap(3, 2, 60),
                     lap(4, 2, 58, "contact"), lap(5, 2, 57, excluded=True), lap(6, 3, 59)]

    def get_lap(self, lid):
        return next((item for item in self.laps if item["id"] == lid), None)

    def get_session(self, sid):
        return self.sessions.get(sid)

    def session_laps(self, sid):
        return [item for item in self.laps if item["session_id"] == sid]

    def list_sessions(self):
        return list(self.sessions.values())


@pytest.fixture
def source(tmp_path):
    return Source(tmp_path / "telemetry.db")


def test_best_consistency_progress_do_not_use_future_other_driver_or_edits(source):
    report = summary.build_report(source, 3)
    s = report["stats"]
    assert s["laps_runs"] == 4 and s["eligible"] == 2
    assert s["best_s"] == 60 and s["median_s"] == 60.5 and s["spread_s"] == 1
    assert s["previous_best_s"] == 62 and s["improvement_s"] == 2
    old = report["fingerprint"]
    source.laps[3]["flags"] = ""  # dismissed detector contact, auto provenance retained
    newer = summary.build_report(source, 3)
    assert newer["stats"]["best_s"] == 58 and newer["fingerprint"] != old
    source.sessions[1]["driver_id"] = "friend"
    assert summary.build_report(source, 3)["stats"]["previous_best_s"] is None


def test_full_route_cutoff_is_best_but_not_confirmed_consistency(source, monkeypatch):
    source.laps.append(lap(7, 2, 55, flags_auto="cutoff"))
    monkeypatch.setattr(summary, "lap_covered", lambda *args: 10000)
    s = summary.build_report(source, 3)["stats"]
    assert s["best_s"] == 55 and s["best_estimated"] and s["estimated"] == 1
    assert s["confirmed"] == 2 and s["median_s"] == 60.5
    monkeypatch.setattr(summary, "lap_covered", lambda *args: 4000)
    assert summary.build_report(source, 3)["stats"]["best_s"] == 60


def test_only_reference_cutoff_preserves_pair_provenance(source, monkeypatch):
    source.laps[0]["flags_auto"] = "cutoff"
    monkeypatch.setattr(summary, "lap_covered", lambda *args: 10000)
    report = summary.build_report(source, 3, 1)
    assert report["stats"]["estimated"] == 0
    assert report["pair"]["a_finish"] == "confirmed"
    assert report["pair"]["b_finish"] == "last_packet"
    assert report["pair"]["b_eligible"] is True
    assert not report["pair"]["coaching_available"]


def test_unknown_metadata_does_not_claim_same_car_pi_progress(source):
    for session in source.sessions.values():
        session["car_pi"] = None
        session["car_ordinal"] = None
    report = summary.build_report(source, 3)
    assert report["stats"]["previous_best_s"] is None
    assert not any(f["id"] == "progress" for f in report["facts"])


def test_recording_missing_laps_unknown_routes_and_same_lap_are_explicit(source):
    with pytest.raises(HTTPException) as error:
        summary.build_report(source, 99)
    assert error.value.status_code == 404
    source.sessions[2]["ended_at"] = None
    with pytest.raises(HTTPException) as error:
        summary.build_report(source, 3)
    assert error.value.status_code == 409
    source.sessions[2]["ended_at"] = 1100
    for ref in (3, 99):
        with pytest.raises(HTTPException):
            summary.build_report(source, 3, ref)


def test_quality_withholds_corner_claims_and_signed_gains(source, monkeypatch):
    def trace(store, lap, digests):
        digests.append([lap["id"], "digest"])
        return SimpleNamespace(capture_quality="continuous", lap_id=lap["id"])
    monkeypatch.setattr(summary, "_trace", trace)
    monkeypatch.setattr(summary, "_reference", lambda *args: (source.laps[0], []))
    monkeypatch.setattr(summary, "detect_corners", lambda trace: object())
    measured = {"comparable": True, "segments": [
        {"kind": "corner", "n": 3, "dt": -.319,
         "a": {"brake_onset_s": None, "throttle_on_s": 7},
         "b": {"brake_onset_s": 3, "throttle_on_s": 8}}]}
    monkeypatch.setattr(summary, "compare_laps", lambda *args: measured)
    report = summary.build_report(source, 3, 1)
    corner = next(f for f in report["facts"] if f["id"] == "corner_3")
    assert "A lost 0.319" in corner["text"]
    assert "throttle" in corner["actions"] and "braking" not in corner["actions"]
    assert report["pair"]["coaching_available"]
    assert any("equivalence" in w for w in report["warnings"])
    measured["comparable"] = False
    assert not summary.build_report(source, 3, 1)["pair"]["coaching_available"]
    source.sessions[1]["car_pi"] = 799
    assert not summary.build_report(source, 3, 1)["pair"]["coaching_available"]


def test_anonymous_request_strict_privacy_prices_output_and_validation(source):
    report = summary.build_report(source, 3)
    wire = openrouter.encode_request(report)
    assert b"PRIVATE" not in wire and b"source_addr" not in wire
    p = json.loads(wire)
    assert p["model"] == MODEL and p["max_tokens"] == 512
    assert p["provider"] == {"data_collection": "deny", "zdr": True,
                             "require_parameters": True, "allow_fallbacks": False,
                             "only": ["google-vertex/global"],
                             "max_price": {"prompt": .75, "completion": 3.75, "request": 0}}
    assert anonymous_facts(report)[0]["id"] == "session"
    result = {"highlight_fact_ids": ["consistency"], "focus_fact_id": "consistency",
              "practice_action": "repeat"}
    assert validate(result, report) == result
    for changed in ({**result, "practice_action": "braking"},
                    {**result, "highlight_fact_ids": ["invented"]},
                    {**result, "highlight_fact_ids": ["session", "session"]},
                    {**result, "extra": "You won!"}):
        with pytest.raises(ValueError):
            validate(changed, report)
    huge = copy.deepcopy(report)
    huge["facts"][0]["metrics"]["x"] = "x" * 20000
    with pytest.raises(ValueError):
        openrouter.encode_request(huge)


def test_receipts_refuse_bad_cost_model_and_truncation(source):
    report = summary.build_report(source, 3)
    provider = response()
    assert openrouter.receipt(provider) == 731
    assert openrouter.decode(provider, report)["practice_action"] == "repeat"
    for cost in (None, -1, float("nan"), True):
        provider["usage"]["cost"] = cost
        with pytest.raises(ValueError):
            openrouter.receipt(provider)
    for model, reason in (("bogus", "stop"), (MODEL, "length")):
        provider["model"], provider["choices"][0]["finish_reason"] = model, reason
        with pytest.raises(ValueError):
            openrouter.decode(provider, report)


def response():
    return {"id": "receipt", "model": MODEL, "usage": {"cost": .0007301},
            "choices": [{"finish_reason": "stop", "message": {"content": json.dumps({
                "highlight_fact_ids": ["consistency"], "focus_fact_id": "consistency",
                "practice_action": "repeat"})}}]}


def test_cross_worker_duplicate_and_shared_month_cap_survive_restart(tmp_path):
    path = tmp_path / "debrief.db"
    db = Ledger(path)
    with ThreadPoolExecutor(max_workers=8) as pool:
        claims = list(pool.map(lambda _: Ledger(path).claim("same"), range(16)))
    assert len([c for c in claims if c]) == 1
    assert Ledger(path).budget()["used_or_reserved_usd"] == .01
    for i in range(MONTH_LIMIT // CALL_LIMIT - 1):
        db.claim(str(i))
    with pytest.raises(BudgetError):
        Ledger(path).claim("over")
    assert db.budget()["remaining_usd"] == 0


def test_failed_ambiguous_calls_need_explicit_retry_and_keep_reservation(tmp_path):
    path = tmp_path / "debrief.db"
    db = Ledger(path, now=lambda: 1)
    first = db.claim("report")
    db.finish("report", first)
    assert Ledger(path).get("report")["state"] == "failed"
    assert db.claim("report") is None
    second = db.claim("report", retry=True)
    assert second and db.budget()["used_or_reserved_usd"] == .02
    late = Ledger(path, now=lambda: 200)
    assert late.get("report")["state"] == "uncertain"
    assert late.claim("report") is None
    assert late.claim("report", retry=True)
    assert late.budget()["used_or_reserved_usd"] == .03
    # Different UTC month starts a new budget without deleting old reservations.
    assert Ledger(path, now=lambda: 32 * 86400).budget()["remaining_usd"] == 1


def test_known_per_call_overcharge_stops_month_and_is_recorded(tmp_path):
    db = Ledger(tmp_path / "debrief.db")
    call = db.claim("report")
    db.finish("report", call, cost=CALL_LIMIT + 1)
    assert db.budget()["used_or_reserved_usd"] == .010001
    with pytest.raises(BudgetError):
        db.claim("new")


def test_api_no_get_charge_cache_reuse_and_input_edits(source, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "private-test-key")
    app = create_app("web")
    app.state.store = source
    calls = []
    monkeypatch.setattr(openrouter, "request", lambda body, key: calls.append(body) or response())
    client = TestClient(app, base_url="http://localhost")
    assert client.get("/api/debrief?lap_a=3").json()["ai"]["state"] == "missing"
    assert not calls
    first = client.post("/api/debrief/generate", json={"lap_a": 3}).json()
    assert first["ai"]["state"] == "ready" and first["ai"]["budget"]["used_or_reserved_usd"] == .000731
    assert client.post("/api/debrief/generate", json={"lap_a": 3}).json()["ai"]["state"] == "ready"
    assert len(calls) == 1
    source.laps[1]["excluded"] = True
    assert client.get("/api/debrief?lap_a=3").json()["ai"]["state"] == "missing"
    # Strict request fields: a client cannot select a cheaper model, raise budget or send free text.
    assert client.post("/api/debrief/generate", json={"lap_a": 3, "model": "bogus"}).status_code == 422
    assert all(b"private-test-key" not in c for c in calls)


def test_api_unknown_charge_and_collector_excludes_debrief(source, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "key")
    app = create_app("web")
    app.state.store = source
    monkeypatch.setattr(openrouter, "request", lambda *args: (_ for _ in ()).throw(TimeoutError()))
    client = TestClient(app, base_url="http://localhost")
    first = client.post("/api/debrief/generate", json={"lap_a": 3}).json()
    assert first["ai"]["state"] == "failed" and first["ai"]["budget"]["used_or_reserved_usd"] == .01
    assert client.post("/api/debrief/generate", json={"lap_a": 3}).json()["ai"]["budget"]["used_or_reserved_usd"] == .01
    routes = {route.path for route in create_app("collector").routes}
    assert not any("debrief" in path for path in routes)
    monkeypatch.delenv("OPENROUTER_API_KEY")
    assert client.post("/api/debrief/generate", json={"lap_a": 3}).status_code == 503


def test_changed_input_while_provider_works_never_publishes_old_advice(source, monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "key")
    app = create_app("web")
    app.state.store = source

    def change(*args):
        source.laps[1]["excluded"] = True
        return response()

    monkeypatch.setattr(openrouter, "request", change)
    result = TestClient(app, base_url="http://localhost").post(
        "/api/debrief/generate", json={"lap_a": 3}).json()
    assert result["ai"]["state"] == "missing" and "explanation" not in result["ai"]
    assert api.ledger(SimpleNamespace(app=app)).budget()["used_or_reserved_usd"] == .000731
