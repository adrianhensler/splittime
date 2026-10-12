"""Which half of SplitTime this process is (ADR 24).

One process doing everything is still the default. Split in two, the collector
is the part that must stay up - it owns the UDP ports, lap detection and the
recording - and the web part can be rebuilt and restarted at will without a
driver losing the lap they are on. Both open the same SQLite file.

    all        UDP in, recording, pages and API (the default; upstream's shape)
    collector  UDP in and recording; HTTP serves only /ws/live and /api/status
    web        pages and API; no UDP, no recorder, asks the collector what is live
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Mapping
from urllib.parse import urlsplit

ALL, COLLECTOR, WEB = "all", "collector", "web"
ROLES = (ALL, COLLECTOR, WEB)

# The collector's connection must never hold the UDP loop for long behind a
# write the web process is making (a reprocess, an import): its frame buffer
# is retried on the next flush, so a short wait loses nothing.
COLLECTOR_BUSY_TIMEOUT_S = 0.25
# How long the web process waits for the collector to say what is recording.
STATUS_TIMEOUT_S = 2.0


class CollectorUnavailable(Exception):
    """The collector did not answer, so what is recording is unknown."""


def from_env(env: Mapping[str, str] | None = None) -> str:
    env = os.environ if env is None else env
    role = (env.get("SPLITTIME_ROLE") or ALL).strip().lower()
    if role not in ROLES:
        raise ValueError(f"SPLITTIME_ROLE must be one of {', '.join(ROLES)}")
    if role == WEB:
        collector_url(env)  # refuse to start without somewhere to ask
    return role


def collector_url(env: Mapping[str, str] | None = None) -> str:
    env = os.environ if env is None else env
    url = (env.get("SPLITTIME_COLLECTOR_URL") or "").strip().rstrip("/")
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.netloc:
        raise ValueError(
            "SPLITTIME_ROLE=web needs SPLITTIME_COLLECTOR_URL, "
            "e.g. http://splittime-collector:8000")
    return url


def collector_status(url: str | None = None,
                     timeout: float = STATUS_TIMEOUT_S) -> dict:
    """The collector's /api/status. Raises CollectorUnavailable on anything
    short of a JSON object: callers use this to decide whether a write is
    safe, and "could not ask" must never read as "nothing is recording"."""
    url = collector_url() if url is None else url.rstrip("/")
    try:
        with urllib.request.urlopen(url + "/api/status", timeout=timeout) as resp:
            data = json.loads(resp.read(1 << 20))
    except (urllib.error.URLError, OSError, ValueError) as exc:
        raise CollectorUnavailable(str(exc) or exc.__class__.__name__) from exc
    if not isinstance(data, dict):
        raise CollectorUnavailable("unexpected status reply")
    return data


def recording_session_ids(status: dict) -> set[int]:
    """Every session id the collector says is open right now."""
    ids = {d.get("session_id") for d in status.get("drivers") or []
           if isinstance(d, dict)}
    ids.add(status.get("session_id"))
    return {i for i in ids if isinstance(i, int)}
