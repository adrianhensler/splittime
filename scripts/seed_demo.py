"""Create a NEW simulator-only database for a local POC; never overwrite data."""
from __future__ import annotations

import argparse
import random
import sys
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(ROOT), str(ROOT / "tests")]

from harness import FakeSocket  # noqa: E402
from app.recorder.laps import SessionTracker  # noqa: E402
from app.recorder.store import Store  # noqa: E402
from app.telemetry.drivers import DriverScopedStore, load_drivers  # noqa: E402
import tools.simulator as simulator  # noqa: E402

DEMO_DRIVERS = ('[{"id":"alpha","name":"SIMULATED Alpha","udp_port":19999},'
                '{"id":"beta","name":"SIMULATED Beta","udp_port":20000}]')


def seed(directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    database = directory / "telemetry.db"
    if database.exists():
        raise SystemExit("Refusing to overwrite an existing recording database.")
    drivers = load_drivers({"SPLITTIME_DRIVERS": DEMO_DRIVERS})
    store = Store(str(database))
    store.register_drivers(drivers)
    try:
        for number, driver in enumerate(drivers, start=61):
            random.seed(number)
            tracker = SessionTracker(DriverScopedStore(store, driver.id))
            sim = simulator.Sim(SimpleNamespace(host="127.0.0.1", port=driver.udp_port,
                                                rate=60.0, wet=False))
            sim.sock.close()
            sim.sock = FakeSocket(tracker)
            sim.event(100, f"SIMULATED {driver.id}")
            sim.race_off()
            tracker.shutdown(sim.sock.t + 20)
    finally:
        store.close()
    print(f"SIMULATED recordings created: {database}")
    print(f"SPLITTIME_DRIVERS={DEMO_DRIVERS}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    seed(parser.parse_args().directory)
