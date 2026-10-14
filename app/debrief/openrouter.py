"""One explicit OpenRouter call. No tools, retries, fallback or unbounded output."""
from __future__ import annotations

import json
import math
import urllib.request
from decimal import Decimal, ROUND_CEILING

from .contracts import MODEL, anonymous_facts, schema, validate
from .ledger import CALL_LIMIT

SYSTEM = (
    "Prioritize a short after-session racing debrief from anonymous measured facts. "
    "A is the selected lap; B is its reference. corner gain_s > 0 means A gained time. "
    "Select up to three useful fact IDs and exactly one practice focus with an action "
    "listed for that fact. Prefer the largest repeatable loss for practice when available. "
    "Treat practice as a hypothesis, never a diagnosis. Times, route equivalence, "
    "game validity and causal explanations are unverified. Do not invent facts. "
    "Return only the requested JSON."
)


def payload(report):
    return {"model": MODEL, "max_tokens": 512,
            "reasoning": {"effort": "minimal", "exclude": True},
            "provider": {"data_collection": "deny", "zdr": True, "require_parameters": True,
                         "only": ["google-vertex/global"], "allow_fallbacks": False,
                         "max_price": {"prompt": 0.75, "completion": 3.75, "request": 0}},
            "messages": [{"role": "system", "content": SYSTEM},
                         {"role": "user", "content": json.dumps(anonymous_facts(report),
                                                                  allow_nan=False)}],
            "response_format": {"type": "json_schema", "json_schema": {
                "name": "session_debrief", "strict": True, "schema": schema(report)}}}


def encode_request(report):
    body = json.dumps(payload(report), ensure_ascii=True, allow_nan=False).encode("ascii")
    # Conservative: at most one input token per ASCII byte, including schema/envelope.
    # Provider prices are hard-capped in dollars per million, reasoning included in output.
    worst_micro = len(body) * 0.75 + 512 * 3.75
    if len(body) > 8000 or worst_micro > CALL_LIMIT:
        raise ValueError("Debrief facts exceed the bounded request size")
    return body


def request(body, key):
    req = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions", data=body,
                                 headers={"Authorization": f"Bearer {key}",
                                          "Content-Type": "application/json",
                                          "X-Title": "SplitTime session debrief"})
    # No redirect can carry a credential/body to another host.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None

    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(req, timeout=45) as response:
        raw = response.read(65537)
    if len(raw) > 65536:
        raise ValueError("Oversized provider response")
    return json.loads(raw)


def receipt(response):
    """Even invalid content may be charged; extract cost before validating content."""
    value = response.get("usage", {}).get("cost")
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise ValueError("Provider charge is unknown")
    return int((Decimal(str(value)) * 1_000_000).to_integral_value(rounding=ROUND_CEILING))


def decode(response, report):
    if response.get("model") not in {MODEL, "google/gemini-3.8-flash-20260902"}:
        raise ValueError("Provider returned a different model")
    if not isinstance(response.get("id"), str) or not response["id"]:
        raise ValueError("Missing provider receipt")
    choice = response["choices"][0]
    if choice.get("finish_reason") != "stop":
        raise ValueError("Provider did not complete the debrief")
    return validate(json.loads(choice["message"]["content"]), report)
