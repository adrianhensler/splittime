"""The AI half of a weekly recap: one bounded call, checked like a race report.

The model writes a short column from the week's measured facts. Every number it
states must be one of them (the race report's check, ADR 33), and the driver
and route names it writes are stored as placeholders the page fills in.
"""
from __future__ import annotations

import json

from ..debrief import openrouter
from ..debrief.contracts import MODEL
from ..racereport.writer import _check_text, _numbers, bounded

PROMPT_VERSION = 1
MAX_TOKENS = 900
LIMITS = {"headline": 140, "story": 1200, "item": 220, "next_week": 220}
LABEL = "Weekly recap"

SYSTEM = (
    "You write the weekly recap for SplitTime, a friendly time-attack rivalry between a few "
    "friends driving Forza Horizon 6 routes. From one week's measured facts write a short, "
    "upbeat, specific sports column: who drove most, personal bests and the biggest "
    "improvements (improved_s, against previous_time_s), records that changed hands "
    "(margin_s is how much the old record was beaten by) and how the standings moved "
    "(records_held_before to records_held, out of contested_routes). Celebrate effort as well "
    "as speed; tease the rivalry lightly and never mock anyone, including a driver who did not "
    "drive. Name drivers and routes exactly as written in the facts. Lap times may be written "
    "as m:ss.sss. estimated_finish true means that time was read from the last packet because "
    "the game stopped sending at the finish line, not timed by the game: whenever you state "
    "such a time, call it estimated (previous_estimated_finish is the same for previous_time_s "
    "and the beaten record). Use only numbers that appear in the facts, exactly as given or rounded; "
    "never compute new ones (no totals, differences or averages of your own). Every digit is "
    "checked, so write rankings and other non-facts in words (first, twice). Do not invent "
    "events, cars, weather, tuning or anything not in the facts. If little happened, keep it "
    "short. highlights are up to four one-line facts worth knowing. next_week is one line "
    "suggesting something concrete to chase, grounded in the facts. Return only the "
    "requested JSON."
)
SCHEMA = {"type": "object", "additionalProperties": False,
          "properties": {"headline": {"type": "string"}, "story": {"type": "string"},
                         "highlights": {"type": "array", "items": {"type": "string"}, "maxItems": 4},
                         "next_week": {"type": "string"}},
          "required": ["headline", "story", "highlights", "next_week"]}


def payload(report):
    return {"model": MODEL, "max_tokens": MAX_TOKENS,
            "reasoning": {"effort": "minimal", "exclude": True},
            "provider": openrouter.PROVIDER,
            "messages": [{"role": "system", "content": SYSTEM},
                         {"role": "user", "content": json.dumps(
                             report["facts"], separators=(",", ":"), allow_nan=False)}],
            "response_format": {"type": "json_schema", "json_schema": {
                "name": "weekly_recap", "strict": True, "schema": SCHEMA}}}


def encode_request(report):
    return bounded(payload(report))


def validate(result, report):
    allowed = {}
    _numbers(report["facts"], allowed)
    names = {key.lower(): name for key, name in report["tags"].items()}
    marks = {f"{{{key}}}" for key in report["tags"]}

    def check(text, limit):
        # no corners in a recap: any "C<n>" it writes is unmeasured
        # a recap is counts: every number in it is checked, small ones too (Codex, #57)
        return _check_text(text, LIMITS[limit], allowed, set(), names, marks, LABEL, small=False)
    if not isinstance(result, dict) or set(result) != set(SCHEMA["required"]):
        raise ValueError("Invalid weekly recap structure")
    if not isinstance(result["highlights"], list) or len(result["highlights"]) > 4:
        raise ValueError("Invalid weekly recap structure")
    return {"headline": check(result["headline"], "headline"), "story": check(result["story"], "story"),
            "highlights": [check(item, "item") for item in result["highlights"]],
            "next_week": check(result["next_week"], "next_week")}
