"""The AI half of a race report: one bounded call that writes prose from measured facts.

Unlike the debrief (ADR 32) the model writes its own sentences, so the output is
checked instead: every number it states must be one of the measured facts, every
corner it names must exist. The model writes the drivers' gamertags; they are
stored as {A} and {B}, which the page turns back into names after escaping, so
a digit in a gamertag is never read as a number. A narrative that fails any
check is not shown.
"""
from __future__ import annotations

import json
import re

from ..debrief import openrouter
from ..debrief.contracts import MODEL
from ..debrief.ledger import CALL_LIMIT

PROMPT_VERSION = 2
MAX_TOKENS = 1000
LIMITS = {"headline": 140, "story": 1100, "item": 220, "practice": 260}

SYSTEM = (
    "You are a race engineer writing a short, direct post-race review of two drivers' runs "
    "on the same route, from measured telemetry facts. Driver A and driver B are named in "
    "drivers; refer to them by those gamertags, exactly as written. "
    "Sign conventions: a_gain_s > 0 means A was quicker over that stretch; a_ahead_after_s is "
    "A's cumulative lead after a section (negative = behind); d_* fields are A minus B; "
    "a_brakes_later_m > 0 means A braked later; a_throttle_earlier_m > 0 means A got back "
    "on the throttle sooner. flat_pct is the share of the stretch at full throttle; pedals or "
    "steering 'on_off' means a digital device such as a keyboard. Sections are numbered and "
    "corners are C<number>. Explain where the race was won and lost and what each driver did "
    "differently there, like a real racer reviewing data: braking, lifting, gear, minimum "
    "speed, exit speed, commitment in fast corners. Give each driver up to three strengths, "
    "up to three costs and one concrete practice focus. Use only numbers that appear in the "
    "facts, exactly as given or rounded; never compute new ones. Do not invent corner names, "
    "scenery, car setup, tuning advice or anything not in the facts. Describe what the data "
    "shows; present any reason behind it as likely, not certain. Return only the requested JSON."
)

_DRIVER = {"type": "object", "additionalProperties": False,
           "properties": {"strengths": {"type": "array", "items": {"type": "string"}, "maxItems": 3},
                          "costs": {"type": "array", "items": {"type": "string"}, "maxItems": 3},
                          "practice": {"type": "string"}},
           "required": ["strengths", "costs", "practice"]}
SCHEMA = {"type": "object", "additionalProperties": False,
          "properties": {"headline": {"type": "string"}, "story": {"type": "string"},
                         "a": _DRIVER, "b": _DRIVER},
          "required": ["headline", "story", "a", "b"]}


def payload(report):
    return {"model": MODEL, "max_tokens": MAX_TOKENS,
            "reasoning": {"effort": "minimal", "exclude": True},
            "provider": openrouter.PROVIDER,
            "messages": [{"role": "system", "content": SYSTEM},
                         {"role": "user", "content": json.dumps(
                             {"drivers": {"A": report["drivers"]["a"], "B": report["drivers"]["b"]},
                              **report["facts"]}, separators=(",", ":"), allow_nan=False)}],
            "response_format": {"type": "json_schema", "json_schema": {
                "name": "race_report", "strict": True, "schema": SCHEMA}}}


def encode_request(report):
    body = json.dumps(payload(report), ensure_ascii=True, allow_nan=False,
                      separators=(",", ":")).encode("ascii")
    # Same conservative bound as the debrief: one input token per byte at the capped prices.
    prices = openrouter.PROVIDER["max_price"]
    worst_micro = len(body) * prices["prompt"] + MAX_TOKENS * prices["completion"]
    if worst_micro > CALL_LIMIT:
        raise ValueError("Race report facts exceed the bounded request size")
    return body


UNITS = {"s": "_s", "kmh": "_kmh", "pct": "_pct", "g": "_g", "m": "_m"}
_UNIT_WORDS = {"km/h": "kmh", "kmh": "kmh", "km": "km", "seconds": "s", "second": "s",
               "sec": "s", "s": "s", "%": "pct", "percent": "pct", "g": "g",
               "metres": "m", "meters": "m", "m": "m"}


_KEY_METRES = re.compile(r"(?<![a-z])(\d+)m(?![a-z])")


def _numbers(value, out, key=""):
    """Every number a fact can be written as, by unit: None holds them all,
    "km" holds metres as km, and "lap" holds whole lap times, written as m:ss.
    A distance in a fact's own name ("first_250m_s") is measured too."""
    for metres in _KEY_METRES.findall(key):
        for name, number in (("m", int(metres)), ("km", int(metres) / 1000), (None, int(metres))):
            out.setdefault(name, set()).add(number)
    if isinstance(value, bool):
        return
    if isinstance(value, (int, float)):
        unit = next((u for u, suffix in UNITS.items() if key.endswith(suffix)), None)
        spellings = [(unit, abs(value))]
        if unit == "m":
            spellings.append(("km", abs(value) / 1000))
        if key == "time_s":
            out.setdefault("lap", set()).add(value)
        for name, number in spellings:
            out.setdefault(name, set()).add(number)
            out.setdefault(None, set()).add(number)  # a unitless number may be any of them
    elif isinstance(value, dict):
        for name, item in value.items():
            _numbers(item, out, name)
    elif isinstance(value, list):
        for item in value:
            _numbers(item, out, key)


def _corners(facts):
    named = {c["c"] for c in facts["corners"]}
    for section in facts["sections"]:
        named.update(section["corners"])
    return named


_NUMBER = re.compile(r"(?<![\w.:])(\d+(?:\.\d+)?)(?:\s*(" + "|".join(
    re.escape(w) for w in sorted(_UNIT_WORDS, key=len, reverse=True)) + r")(?![\w/]))?")
_CORNER = re.compile(r"\bC(\d+)\b")
_GROUPED = re.compile(r"(?<![\d.,])\d{1,3}(?:,\d{3})+(?![\d,]|\.\d)")
_LAP_TIME = re.compile(r"(?<![\w.:])(\d+):([0-5]\d(?:\.\d+)?)(?![\w:]|\.\d)")


def _placeholders(text, drivers):
    """Gamertags back to {A}/{B}: whole words only, longest first so one name
    inside another is safe, and never inside a placeholder already there."""
    tags = sorted(((name, f"{{{side.upper()}}}") for side, name in drivers.items() if name),
                  key=lambda tag: len(tag[0]), reverse=True)
    if not tags:
        return text
    lookup = {name.casefold(): mark for name, mark in tags}
    pattern = re.compile(r"(?<!\w)(?:" + "|".join(re.escape(name) for name, _ in tags) + r")(?!\w)",
                         re.IGNORECASE)
    parts = re.split(r"(\{[AB]\})", text)  # odd parts are existing placeholders
    return "".join(part if i % 2 else pattern.sub(lambda m: lookup[m.group(0).casefold()], part)
                   for i, part in enumerate(parts))


def _check_text(text, limit, allowed, corners, drivers):
    if not isinstance(text, str):
        raise ValueError("Race report text is missing or too long")
    text = _placeholders(text, drivers)  # limits apply to what is stored and read back
    if not text.strip() or len(text) > limit:
        raise ValueError("Race report text is missing or too long")
    # "9,000 m" is one number: check it whole, never its fragments ("9" and "000 m")
    checked = _GROUPED.sub(lambda m: m.group(0).replace(",", ""), text)
    if re.sub(r"\{[AB]\}", "", text).count("{") or "}" in re.sub(r"\{[AB]\}", "", text):
        raise ValueError("Race report uses an unknown placeholder")
    for n in _CORNER.findall(text):
        if int(n) not in corners:
            raise ValueError(f"Race report names corner C{n}, which was not measured")
    if re.search(r"\d:\d", _LAP_TIME.sub(" ", checked)):
        raise ValueError("Race report states a time that is not a measured lap time")
    found = [(f"{minutes}:{seconds}", int(minutes) * 60 + float(seconds), len(seconds.partition(".")[2]), "lap")
             for minutes, seconds in _LAP_TIME.findall(checked)]
    found += [(token, float(token), len(token.partition(".")[2]), _UNIT_WORDS.get(word))
              for token, word in _NUMBER.findall(_LAP_TIME.sub(" ", checked))]
    for token, value, places, unit in found:
        # small unitless whole numbers are counts and ordinals ("three corners", "5th gear")
        if unit is None and not places and value <= 10:
            continue
        if not any(abs(round(v, places) - value) < 1e-9 for v in allowed.get(unit, ())):
            raise ValueError(f"Race report states {token}{' ' + unit if unit else ''}, "
                             "which is not a measured fact")
    # Closing rule: a digit nothing above read (".999", "9 000", "½"-style tricks)
    # is a number that was never checked. Only digits inside a word ("S2") may remain.
    residue = _NUMBER.sub(" ", _LAP_TIME.sub(" ", checked))
    if re.search(r"\d", re.sub(r"\b[A-Za-z]+\d\w*", " ", residue)):
        raise ValueError("Race report states a number that could not be checked")
    return text


def validate(result, report):
    facts = report["facts"]
    allowed, corners, drivers = {}, _corners(facts), report.get("drivers", {})
    _numbers(facts, allowed)
    if not isinstance(result, dict) or set(result) != {"headline", "story", "a", "b"}:
        raise ValueError("Invalid race report structure")

    def check(text, limit):
        return _check_text(text, LIMITS[limit], allowed, corners, drivers)
    out = {"headline": check(result["headline"], "headline"), "story": check(result["story"], "story")}
    for side in ("a", "b"):
        notes = result[side]
        if not isinstance(notes, dict) or set(notes) != {"strengths", "costs", "practice"}:
            raise ValueError("Invalid race report structure")
        for key in ("strengths", "costs"):
            if not isinstance(notes[key], list) or len(notes[key]) > 3:
                raise ValueError("Invalid race report structure")
        out[side] = {key: [check(item, "item") for item in notes[key]] for key in ("strengths", "costs")}
        out[side]["practice"] = check(notes["practice"], "practice")
    return out


def decode(response, report):
    return validate(openrouter.content(response), report)
