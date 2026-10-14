"""A model chooses supported facts/actions; application templates supply all claims."""
from __future__ import annotations

MODEL = "google/gemini-3.8-flash"
PROMPT_VERSION = 1
PRACTICE = {
    "repeat": "Run three more clean laps in the same car and PI. Aim to repeat your pace before chasing a faster one.",
    "capture": "Collect another confirmed finish before drawing a stronger conclusion from these recordings.",
    "entry_exit": "Replay this corner in A and B. Compare entry and exit speed, then try one small change on your next run.",
    "braking": "Overlay braking through this corner. Try one small change to brake release and check the next clean lap; the traces do not prove a cause.",
    "throttle": "Overlay throttle pickup through this corner. Try one small change to its timing and check the next clean lap; the traces do not prove a cause.",
}


def schema(report):
    ids = [f["id"] for f in report["facts"]]
    return {"type": "object", "additionalProperties": False,
            "properties": {
                "highlight_fact_ids": {"type": "array", "items": {"type": "string", "enum": ids},
                                       "minItems": 1, "maxItems": 3},
                "focus_fact_id": {"type": "string", "enum": ids},
                "practice_action": {"type": "string", "enum": list(PRACTICE)}},
            "required": ["highlight_fact_ids", "focus_fact_id", "practice_action"]}


def anonymous_facts(report):
    # Explicit allowlist. No names, IPs, raw packets, timestamps, route labels or free text.
    return [{"id": f["id"], "metrics": f["metrics"], "actions": f["actions"]}
            for f in report["facts"]]


def validate(result, report):
    facts = {f["id"]: f for f in report["facts"]}
    if not isinstance(result, dict) or set(result) != {
            "highlight_fact_ids", "focus_fact_id", "practice_action"}:
        raise ValueError("Invalid debrief structure")
    ids = result["highlight_fact_ids"]
    if (not isinstance(ids, list) or not 1 <= len(ids) <= 3
            or any(not isinstance(i, str) or i not in facts for i in ids)
            or len(set(ids)) != len(ids)):
        raise ValueError("Unsupported debrief highlights")
    fid, action = result["focus_fact_id"], result["practice_action"]
    if (not isinstance(fid, str) or fid not in facts or not isinstance(action, str)
            or action not in facts[fid]["actions"] or action not in PRACTICE):
        raise ValueError("Unsupported practice focus")
    return result


def explain(result, report):
    validate(result, report)
    facts = {f["id"]: f for f in report["facts"]}
    return {"highlights": [facts[fid]["text"] for fid in result["highlight_fact_ids"]],
            "focus": facts[result["focus_fact_id"]]["text"],
            "practice": PRACTICE[result["practice_action"]],
            "focus_fact_id": result["focus_fact_id"]}
