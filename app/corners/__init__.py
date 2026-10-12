"""Route-fixed corner analysis (SplitTime, not part of upstream LapScope).

Contract: docs/CORNER_CONTRACT.md. Nothing here reads the database or touches
the recorder; `api.py` is the only module that knows about the store.
"""

from .compare import compare_laps
from .detect import VERSION, detect_corners
from .trace import build_trace, samples_from_rows

__all__ = ["VERSION", "build_trace", "compare_laps", "detect_corners",
           "samples_from_rows"]
