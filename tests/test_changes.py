"""The change token the open pages poll (ADR 36): it moves when a result does,
and stays put while a recording is only adding frames or an unfinished lap."""
import sqlite3
from types import SimpleNamespace

from harness import run, sessions
from app.changes import changes, token
from app.debrief.ledger import Ledger


def recorded(tmp_path):
    def scenario(sim):
        sim.event(120, "event")
        sim.race_off()
    return run(scenario, tmp_path)


def write(store, sql, *args):
    with sqlite3.connect(store.db_path) as conn:
        conn.execute(sql, args)


def test_token_is_stable_and_never_cached(tmp_path):
    store = recorded(tmp_path)
    response = SimpleNamespace(headers={})
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(store=store)))
    assert changes(request, response) == {"token": token(store)} == {"token": token(store)}
    assert response.headers["Cache-Control"] == "no-store"
    assert not (tmp_path / "debrief.db").exists()  # a poll never creates the ledger


def test_a_recording_in_progress_does_not_move_it(tmp_path):
    store = recorded(tmp_path)
    before = token(store)
    write(store, "INSERT INTO sessions (id, started_at) VALUES (999, 1.0)")
    write(store, "INSERT INTO frames (session_id, t, raw) VALUES (999, 1.0, x'00')")
    write(store, "INSERT INTO laps (session_id, lap_number, started_t) VALUES (999, 1, 1.0)")
    assert token(store) == before
    # the lap finishing is a result
    write(store, "UPDATE laps SET ended_t = 61.0, lap_time = 60.0 WHERE session_id = 999")
    assert token(store) != before


def test_edits_names_and_finished_ai_writing_move_it(tmp_path):
    store = recorded(tmp_path)
    session = sessions(store)[0]["id"]
    seen = {token(store)}
    store.add_edit(session, "exclude_lap", 5.0)
    seen.add(token(store))
    write(store, "UPDATE sessions SET name = 'Night run' WHERE id = ?", session)
    seen.add(token(store))
    db = Ledger(tmp_path / "debrief.db")
    seen.add(token(store))  # an empty ledger is no change...
    assert len(seen) == 3
    with db.connection() as conn:
        conn.execute("INSERT INTO reports (key, call_id, state, created) VALUES ('k', 'c', 'pending', 1)")
    assert token(store) in seen  # ...nor is a report still being written
    with db.connection() as conn:
        conn.execute("UPDATE reports SET state = 'ready'")
    assert token(store) not in seen
