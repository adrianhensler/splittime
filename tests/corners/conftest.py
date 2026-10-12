"""Fixtures for the corner-analysis tests.

`sim_*`: upstream's simulator driven through the real recorder
(tests/harness.py). Its circuit is two 600 m straights joined by two
120 m-radius half circles, so the right answer is known: two 180-degree
corners, turning the same way, entered at about 600 m and 1577 m.
"""

from __future__ import annotations

import pytest

import harness
from corner_course import trace_of


@pytest.fixture(scope="session")
def sim_store(tmp_path_factory):
    def scenario(sim):
        sim.event(140, "corner fixtures")
        sim.race_off()

    return harness.run(scenario, tmp_path_factory.mktemp("corners"))


@pytest.fixture(scope="session")
def sim_laps(sim_store):
    session_id = harness.sessions(sim_store)[0]["id"]
    laps = harness.completed_laps(sim_store, session_id)
    assert len(laps) >= 3
    return laps


@pytest.fixture(scope="session")
def sim_traces(sim_store, sim_laps):
    return [trace_of(sim_store, lap) for lap in sim_laps]
