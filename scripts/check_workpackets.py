"""Check product PRs for missing/stale Workpacket records, not evidence truth."""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from fnmatch import fnmatch
from pathlib import Path

PACKETS = {
    "WP-001": "WP-001-import-baseline.md",
    "WP-002": "WP-002-two-drivers.md",
    "WP-003": "WP-003-deploy-and-real-captures.md",
    "WP-004": "WP-004-rivalry-views.md",
    "WP-005": "WP-005-corner-comparison.md",
    "WP-006": "WP-006-summary-page.md",
    "WP-007": "WP-007-collector-split.md",
}
# Shared files (main, generic API/UI/tests) require declared scope. Isolated
# modules additionally require the packet below; declarations cannot omit it.
SCOPES = {
    "WP-002": ("app/telemetry/*", "app/recorder/*", "tests/test_multi_driver.py",
               "tests/test_driver_review.py", "tests/test_rivals_start.py",
               "tests/ui/driver-groups.test.cjs"),
    "WP-003": ("Dockerfile", "docker-compose.yml"),
    "WP-004": ("app/rivalry.py", "app/cars.py", "app/static/rivalry.html",
               "app/static/js/rivalry.js", "tests/test_rivalry*.py",
               "tests/ui/rivalry.test.cjs"),
    "WP-005": ("app/corners/*", "tests/corners/*"),
    "WP-006": ("app/static/compare.html", "app/static/js/compare.js",
               "tests/ui/compare.test.cjs"),
}


def product_file(path: str) -> bool:
    return (path.startswith(("app/", "tools/"))
            or path.startswith("tests/") and path != "tests/test_workpacket_guard.py"
            or path in ("Dockerfile", "docker-compose.yml", "requirements.txt",
                        "requirements-dev.txt"))


def section(text: str, name: str) -> str:
    match = re.search(rf"^## {re.escape(name)}\s*\n(.*?)(?=^## |\Z)",
                      text, re.MULTILINE | re.DOTALL)
    return match[1].strip() if match else ""


def field(text: str, name: str) -> str:
    match = re.search(rf"^\|\s*{name}\s*\|([^|]+)\|", text, re.MULTILINE)
    return match[1].strip() if match else ""


def evidence_rows(text: str, prefix: str, columns: int) -> bool:
    rows = re.findall(rf"^\|\s*{prefix}\d+\s*\|(.+)\|\s*$", text, re.MULTILINE)
    return bool(rows) and all(len(parts := row.split("|")) >= columns
                              and all(p.strip() not in ("", "—", "-")
                                      for p in parts[:columns]) for row in rows)


def check(changed: list[str], body: str, draft: bool, root: Path) -> list[str]:
    if not any(product_file(path) for path in changed):
        return []
    declaration = re.search(r"^Workpackets:[ \t]*(.*?)\r?$", body, re.MULTILINE)
    scope = declaration[1].strip() if declaration else ""
    if re.match(r"none\b", scope, re.IGNORECASE):
        # Trivial changes need no packet; the reviewer judges the reason.
        if (re.fullmatch(r"none\s*[—-]\s*\S.*", scope, re.IGNORECASE)
                and not re.search(r"WP-\d{3}", scope)):
            return []
        return ["Use Workpackets: none — <reason> for a trivial change; "
                "do not combine an exemption with packet IDs."]
    declared = set(re.findall(r"WP-\d{3}", declaration[1])) if declaration else set()
    required = {packet for packet, patterns in SCOPES.items()
                if any(fnmatch(path, pattern) for path in changed for pattern in patterns)}
    errors = []
    if not declared:
        errors.append("Product changes require a Workpackets: WP-NNN line in the PR body.")
    for packet in sorted(required - declared):
        errors.append(f"Changed module requires declared {packet}.")
    for packet in sorted(declared | required):
        if packet not in PACKETS:
            errors.append(f"Unknown packet {packet}.")
            continue
        path = "work/" + PACKETS[packet]
        if path not in changed:
            errors.append(f"{packet}: update {path} in this PR.")
        try:
            text = (root / path).read_text(encoding="utf-8")
        except FileNotFoundError:
            errors.append(f"{packet}: packet file is missing.")
            continue
        status, worker = field(text, "Status"), field(text, "Worker")
        if not status or re.match(r"draft\b", status, re.IGNORECASE):
            errors.append(f"{packet}: status is missing or draft.")
        if not worker or worker in ("—", "-", "none"):
            errors.append(f"{packet}: assign one checkpoint owner in Worker.")
        checkpoint = section(text, "Checkpoint")
        if not checkpoint or re.search(r"not started", checkpoint, re.IGNORECASE):
            errors.append(f"{packet}: checkpoint is missing or says not started.")
        for name in ("Claims", "Evidence"):
            if not section(text, name):
                errors.append(f"{packet}: {name} must locate the live PR record.")
        if not draft:
            for name, prefix in (("Claims", "C"), ("Evidence", "E")):
                if not evidence_rows(section(text, name), prefix, 2):
                    errors.append(f"{packet}: ready PR needs final {name} rows, not a PR-only link.")
            for name in ("Known, unknown, unproven", "Verification", "Acceptance"):
                content = section(text, name)
                if content in ("", "—", "-"):
                    errors.append(f"{packet}: ready PR must state {name}, including pending items.")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--event", type=Path, required=True)
    args = parser.parse_args()
    event = json.loads(args.event.read_text(encoding="utf-8"))
    pr = event["pull_request"]
    root = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"],
                                        text=True).strip())
    changed = subprocess.check_output(
        ["git", "diff", "--name-only", f"{pr['base']['sha']}...{pr['head']['sha']}"],
        text=True, cwd=root).splitlines()
    errors = check(changed, pr.get("body") or "", pr["draft"], root)
    for error in errors:
        print(error)
    print(f"Workpacket record check: {len(errors)} issue(s). Evidence truth requires review.")
    return int(bool(errors))


if __name__ == "__main__":
    raise SystemExit(main())
