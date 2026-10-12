"""Driver labels are assigned by the local UDP destination port, not source IP."""
from __future__ import annotations
import json
import os
import re
from dataclasses import dataclass
from typing import Mapping


@dataclass(frozen=True)
class DriverSpec:
    id: str
    name: str
    udp_port: int


def load_drivers(env: Mapping[str, str] | None = None) -> list[DriverSpec]:
    """Parse SPLITTIME_DRIVERS; preserve one-port upstream behavior by default."""
    env = os.environ if env is None else env
    raw = env.get("SPLITTIME_DRIVERS")
    if not raw:
        raw = json.dumps([{"id": "legacy", "name": "Driver",
                           "udp_port": int(env.get("TELEMETRY_UDP_PORT", "9999"))}])
    try:
        items = json.loads(raw)
    except (json.JSONDecodeError, TypeError) as exc:
        raise ValueError("SPLITTIME_DRIVERS must be a JSON list") from exc
    if not isinstance(items, list) or not 1 <= len(items) <= 8:
        raise ValueError("SPLITTIME_DRIVERS must contain 1-8 driver objects")
    result: list[DriverSpec] = []
    ids: set[str] = set()
    ports: set[int] = set()
    for x in items:
        if not isinstance(x, dict):
            raise ValueError("Each driver must be an object")
        ident, name, port = x.get("id"), x.get("name"), x.get("udp_port")
        if not isinstance(ident, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,32}", ident):
            raise ValueError("Driver id must be 1-32 ASCII letters/digits/_/-")
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 80:
            raise ValueError("Driver name must be nonempty and at most 80 chars")
        if type(port) is not int or not 1025 <= port <= 65535 or 5200 <= port <= 5300:
            raise ValueError("UDP port must be 1025-65535, excluding 5200-5300")
        if ident in ids or port in ports:
            raise ValueError("Duplicate driver id or UDP port")
        ids.add(ident)
        ports.add(port)
        result.append(DriverSpec(ident, name.strip(), port))
    return result


class DriverScopedStore:
    """Let upstream SessionTracker create an attributed session, without rewrites."""

    def __init__(self, store, driver_id: str):
        self.store = store
        self.driver_id = driver_id

    def create_session(self, started_at: float, frame: dict) -> int:
        return self.store.create_session(started_at, frame, driver_id=self.driver_id)

    def __getattr__(self, name: str):
        return getattr(self.store, name)
