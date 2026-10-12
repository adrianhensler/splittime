"""Coalesce source-address provenance; addresses never authenticate a driver."""
from __future__ import annotations

import logging

log = logging.getLogger("lapscope.udp")
SOURCE_INTERVAL_S = 5.0


class SourceTracker:
    def __init__(self, store, hub, driver_id):
        self.store, self.hub, self.driver_id = store, hub, driver_id
        self.session_id = None
        self.address = None
        self.changes = 0
        self._dirty = False
        self._last_write = float("-inf")
        self._last_warning = float("-inf")

    def sync_session(self, session_id, now):
        if session_id != self.session_id:
            self.flush(now, force=True)
            self.session_id = session_id
            self.address = None
            self.changes = 0
            self._dirty = False
            self._last_write = self._last_warning = float("-inf")

    def observe(self, session_id, address, now):
        self.sync_session(session_id, now)
        if session_id is None:
            return
        if address != self.address:
            if self.address is not None:
                self.changes += 1
                self.hub.source_changes += 1
                if now - self._last_warning >= SOURCE_INTERVAL_S:
                    log.warning("Driver %s session %d: UDP source changed from %s to %s (%d changes)",
                                self.driver_id, session_id, self.address, address, self.changes)
                    self._last_warning = now
            self.address = address
            self._dirty = True
        self.flush(now)

    def flush(self, now, *, force=False):
        if not self._dirty or (not force and now - self._last_write < SOURCE_INTERVAL_S):
            return
        self._last_write = now  # failed writes are rate-limited too
        if self.store is None or not hasattr(self.store, "record_source"):
            self._dirty = False
            return
        try:
            self.store.record_source(self.session_id, self.address)
        except Exception:
            log.exception("Could not record UDP source for session %s", self.session_id)
        else:
            self._dirty = False
