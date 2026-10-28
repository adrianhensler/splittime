"""Race report: measured section facts from real recorder output, the fact-checked
narrative contract and the shared, bounded spend path (ADR 33)."""
import copy
import json

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import harness
from app.debrief import openrouter
from app.debrief.contracts import MODEL
from app.main import create_app
from app.racereport import facts, writer


@pytest.fixture(scope="module")
def circuit(tmp_path_factory):
    def scenario(sim):
        sim.event(140, "race report")
        sim.race_off()

    store = harness.run(scenario, tmp_path_factory.mktemp("race_report"))
    session_id = harness.sessions(store)[0]["id"]
    laps = [lap for lap in harness.completed_laps(store, session_id) if not lap["flags"]]
    assert len(laps) >= 2
    return store, laps[0]["id"], laps[1]["id"]


@pytest.fixture(autouse=True)
def continuous(monkeypatch):
    """The simulator never advances packet timestamps, so its captures read as
    "unknown" quality; a real continuous capture is what the gate expects."""
    real = facts.build_trace

    def build_trace(*args, **kwargs):
        trace = real(*args, **kwargs)
        trace.capture_quality = "continuous"
        return trace
    monkeypatch.setattr(facts, "build_trace", build_trace)


def test_sections_add_up_and_every_fact_is_plain_json(circuit):
    store, a, b = circuit
    report = facts.build(store, a, b)
    f = report["facts"]
    assert 4 <= len(f["sections"]) <= 7
    assert [s["n"] for s in f["sections"]] == list(range(1, len(f["sections"]) + 1))
    # sections are contiguous and the running lead is the sum of section gains
    for prev, cur in zip(f["sections"], f["sections"][1:]):
        assert prev["to_m"] == cur["from_m"]
    assert f["sections"][-1]["a_ahead_after_s"] == pytest.approx(
        sum(s["a_gain_s"] for s in f["sections"]), abs=.01)
    assert f["same_car"] is True and len(f["corners"]) <= 4
    for side in ("a", "b"):
        lap = f["lap"][side]
        assert 0 <= lap["flat_pct"] <= 100 and lap["pedals"] in ("on_off", "progressive")
    json.dumps(report, allow_nan=False)
    assert facts.build(store, a, b)["fingerprint"] == report["fingerprint"]
    assert writer.encode_request(report)  # fits the $0.01 worst-case reservation


def test_distances_are_metres_not_route_units(circuit, monkeypatch):
    """distance_traveled is a route parameter: every distance goes through the
    reference lap's metres_per_unit, and so does the window for 'first 250 m'."""
    store, a, b = circuit
    base = facts.build(store, a, b)["facts"]
    real = facts.detect_corners

    def doubled(trace):
        route = real(trace)
        route.metres_per_unit *= 2
        return route
    monkeypatch.setattr(facts, "detect_corners", doubled)
    twice = facts.build(store, a, b)["facts"]
    assert twice["route_m"] == pytest.approx(2 * base["route_m"], abs=2)
    assert twice["corners"][0]["at_m"] == pytest.approx(2 * base["corners"][0]["at_m"], abs=2)
    assert all(s["to_m"] == pytest.approx(2 * t["to_m"], abs=2)
               for s, t in zip(twice["sections"], base["sections"])) or \
        len(twice["sections"]) != len(base["sections"])
    assert twice["lap"]["a"]["first_250m_s"] < base["lap"]["a"]["first_250m_s"]


def test_only_comparable_eligible_pairs_are_measured(circuit, monkeypatch):
    store, a, b = circuit
    for args, code in (((a, a), 409), ((a, 999999), 404)):
        with pytest.raises(HTTPException) as error:
            facts.build(store, *args)
        assert error.value.status_code == code
    monkeypatch.setattr(facts, "_eligible", lambda *args: {"candidate_clean": False,
                                                          "finish": "confirmed"})
    with pytest.raises(HTTPException) as error:
        facts.build(store, a, b)
    assert error.value.status_code == 409 and "eligible" in error.value.detail


def test_a_stop_keeps_its_samples_and_a_rewind_keeps_the_last_pass(monkeypatch):
    monkeypatch.setattr(facts, "parse", lambda raw: raw)

    def frame(d, accel):
        return {"distance_traveled": d, "accel": accel}
    stopped = [frame(10, 0)] * 100 + [frame(10 + i, 255) for i in range(1, 101)]
    kept = facts._frames([(0, f) for f in stopped], 0)
    assert len(kept) == 200 and facts._share(kept, lambda f: f["accel"] >= facts.FLAT) == 50
    rewound = [frame(d, 0) for d in (1, 2, 3, 4)] + [frame(d, 255) for d in (2, 3, 4, 5)]
    assert [(s, f["accel"]) for s, f in facts._frames([(0, f) for f in rewound], 0)] == \
        [(1, 0), (2, 255), (3, 255), (4, 255), (5, 255)]


REPORT = {"facts": {
    "a_gain_s": -4.751, "route_m": 5965, "same_car": True,
    "lap": {"a": {"time_s": 167.13, "first_250m_s": 6.412, "flat_pct": 42, "max_g": 3.7},
            "b": {"time_s": 162.379, "flat_pct": 74, "max_g": 4.1}},
    "sections": [{"n": 6, "from_m": 4261, "to_m": 5115, "corners": [19, 20], "a_gain_s": -2.252,
                  "a": {"flat_pct": 48, "min_kmh": 162}, "b": {"flat_pct": 83, "min_kmh": 216},
                  "d_min_kmh": -54}],
    "corners": [{"c": 19, "a_gain_s": -0.42, "a": {"gear": 3}, "b": {"gear": 5}}]}}


def narrative(**changes):
    side = {"strengths": ["Quicker early."], "costs": ["C19 in 3rd where {B} held 5th."],
            "practice": "Keep it flat through C20."}
    out = {"headline": "{B} wins by 4.75 s; 2.252 s of it in section 6",
           "story": "Between 4.3 and 5.1 km {A} ran 48% full throttle against 83%, "
                    "54 km/h slower at the minimum. {B} still pulled 4.1 g. Times 2:47.130 and 2:42.379.",
           "a": dict(side), "b": dict(side)}
    out.update(changes)
    return out


def test_narrative_numbers_must_be_measured_facts_in_the_right_unit():
    assert writer.validate(narrative(), REPORT)
    assert writer.validate(narrative(story="Section 6 runs from 4,261 m to 5,115 m."), REPORT)
    assert writer.validate(narrative(story="In S2, C19 in 3rd gear; section 6 cost 2.252 s."), REPORT)
    assert writer.validate(narrative(story="{A} took 6.412 s over the first 250 m."), REPORT)  # in a fact's name
    for bad in ({"headline": "{B} wins by 3.9 s"},       # not a measured time
                {"headline": "{B} wins by 4.1 s"},       # a g value is not seconds
                {"story": "{A} was 37 km/h slower"},
                {"story": "{A} lost 7 s"},               # small numbers still checked with a unit
                {"story": "{A} missed C40"},
                {"story": "Times 99:47.130 and 2:42.379"},  # minutes are checked too
                {"story": "Time 2:59.999."},              # sentence punctuation is no way round it
                {"story": "The route is 9,000 m long."},  # a grouped number is checked whole
                {"story": "{A} lost .999 s."},            # any digit left unread is rejected
                {"story": "{A} lost 1 000 m."},
                {"story": "{A} lost 6.412 s over the first 250 s."},  # a name's metres stay metres
                {"story": "{A} lost 47.130 s"},           # lap-time seconds are not a gap
                {"story": "{FishFighterNS} lost"},       # names never come from the model
                {"story": "x" * 1200},
                {"a": {"strengths": [], "costs": [], "practice": "Go", "extra": "!"}}):
        with pytest.raises(ValueError):
            writer.validate(narrative(**bad), REPORT)


def test_gamertags_are_stored_as_placeholders_and_never_read_as_numbers():
    named = {**REPORT, "drivers": {"a": "FishFighterNS", "b": "Captn Compass 77"}}
    out = writer.validate(narrative(headline="Captn Compass 77 wins by 4.75 s",
                                    story="fishfighterns ran 48% full throttle; Captn Compass 77 83%."), named)
    assert out["headline"] == "{B} wins by 4.75 s"
    assert out["story"] == "{A} ran 48% full throttle; {B} 83%."
    assert writer.validate(out, named) == out  # cached results re-check unchanged
    with pytest.raises(ValueError):
        writer.validate(narrative(story="Captn Compass 78 won"), named)
    # a one-letter gamertag never touches stored placeholders or other words
    short = {**REPORT, "drivers": {"a": "A", "b": "Bob"}}
    once = writer.validate(narrative(story="A leads Bob, and {B} trails {A}."), short)
    assert once["story"] == "{A} leads {B}, and {B} trails {A}."
    assert writer.validate(once, short) == once
    with pytest.raises(ValueError):  # the stored form must fit the limit too
        writer.validate(narrative(headline="A " + "x" * 138), short)


def test_one_drivers_two_runs_are_told_apart(circuit):
    store, a, b = circuit  # both laps come from one session
    driver = store.get_session(store.get_lap(a)["session_id"]).get("driver_id") or "legacy"
    assert facts.build(store, a, b, {driver: "Sam"})["drivers"] == {"a": "Sam (A)", "b": "Sam (B)"}
    assert facts.build(store, a, b, {driver: "Sam"})["fingerprint"] != facts.build(store, a, b)["fingerprint"]


def test_request_names_drivers_and_is_bounded_and_strict(circuit):
    store, a, b = circuit
    report = facts.build(store, a, b)
    wire = json.loads(writer.encode_request(report))
    assert wire["model"] == MODEL and wire["max_tokens"] == writer.MAX_TOKENS
    assert wire["provider"] == openrouter.PROVIDER
    assert wire["response_format"]["json_schema"]["strict"] is True
    sent = json.loads(wire["messages"][1]["content"])
    assert sent["drivers"] == {"A": report["drivers"]["a"], "B": report["drivers"]["b"]}
    assert set(sent) == {"drivers", *report["facts"]}
    assert "session" not in json.dumps(sent) and "car_name" not in json.dumps(sent)
    huge = copy.deepcopy(report)
    huge["facts"]["corners"] *= 40
    with pytest.raises(ValueError):
        writer.encode_request(huge)


def provider(content):
    return {"id": "receipt", "model": MODEL, "usage": {"cost": .0011},
            "choices": [{"finish_reason": "stop", "message": {"content": json.dumps(content)}}]}


def test_generate_caches_a_checked_narrative_and_never_shows_a_failed_one(circuit, monkeypatch, caplog):
    store, a, b = circuit
    monkeypatch.setenv("OPENROUTER_API_KEY", "private-test-key")
    app = create_app("web")
    app.state.store = store
    client = TestClient(app, base_url="http://localhost")
    assert client.get(f"/api/race-report?lap_a={a}&lap_b={b}").json()["ai"]["state"] == "missing"

    report = facts.build(store, a, b)
    gain = report["facts"]["sections"][0]["a_gain_s"]
    good = narrative(headline=f"Section 1: {{A}} {abs(gain):.3f} s", story="{A} against {B}.",
                     a={"strengths": [], "costs": [], "practice": "Repeat section 1."},
                     b={"strengths": [], "costs": [], "practice": "Repeat section 1."})
    calls = []
    monkeypatch.setattr(openrouter, "request", lambda body, key: calls.append(body) or provider(good))
    body = client.post("/api/race-report/generate", json={"lap_a": a, "lap_b": b}).json()
    assert body["ai"]["state"] == "ready" and body["ai"]["narrative"]["story"] == "{A} against {B}."
    assert b"private-test-key" not in calls[0]
    # cached: viewing and repeating never call again
    assert client.get(f"/api/race-report?lap_a={a}&lap_b={b}").json()["ai"]["state"] == "ready"
    client.post("/api/race-report/generate", json={"lap_a": a, "lap_b": b})
    assert len(calls) == 1

    # the reverse pair is a different report; an invented number fails the check,
    # and the check's reason is logged so the validator can be tuned
    monkeypatch.setattr(openrouter, "request", lambda body, key: provider(narrative(headline="Won by 99.9 s")))
    with caplog.at_level("INFO", logger="app.racereport.api"):
        body = client.post("/api/race-report/generate", json={"lap_a": b, "lap_b": a}).json()
    assert "(check): Race report states 99.9 s, which is not a measured fact" in caplog.text
    assert body["ai"]["state"] == "failed" and "narrative" not in body["ai"]
    assert body["ai"]["cost_or_reserved_usd"] == pytest.approx(.0011)


def test_generate_without_a_key_keeps_measurements(circuit, monkeypatch):
    store, a, b = circuit
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    app = create_app("web")
    app.state.store = store
    client = TestClient(app, base_url="http://localhost")
    assert client.post("/api/race-report/generate", json={"lap_a": a, "lap_b": b}).status_code == 503
    assert client.get(f"/api/race-report?lap_a={a}&lap_b={b}").json()["ai"]["enabled"] is False


def test_a_flood_of_report_requests_through_the_real_app_builds_once(circuit, monkeypatch, tmp_path):
    # through create_app's middleware, where a caller leaving is not visible
    import threading
    import time

    from app.racereport import api as race_api
    store, a, b = circuit
    real, builds = race_api.report_for, []

    def slow(request, lap_a, lap_b):
        builds.append((lap_a, lap_b))
        time.sleep(0.3)
        return real(request, lap_a, lap_b)
    monkeypatch.setattr(race_api, "report_for", slow)
    # one event loop for every request, as in production: run the app's lifespan
    monkeypatch.setenv("SPLITTIME_COLLECTOR_URL", "http://127.0.0.1:9")
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    app = create_app("web")
    with TestClient(app, base_url="http://localhost") as client:
        app.state.store = store
        codes = []

        def get():
            codes.append(client.get(f"/api/race-report?lap_a={a}&lap_b={b}").status_code)
        threads = [threading.Thread(target=get) for _ in range(12)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
    assert codes == [200] * 12
    assert builds == [(a, b)]
