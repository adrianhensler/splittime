"""Try the handoff failures actually observed in SplitTime and bypass variants."""
import importlib.util
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location(
    "workpacket_guard", Path(__file__).parents[1] / "scripts/check_workpackets.py")
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

TEXT = """# Packet
| Status | partial |
| Worker | Codex (checkpoint owner); original work by GPT-6 |
## Claims
See PR #10.
## Evidence
See PR #10.
## Checkpoint
Application code f68d70a; next: private deployment checks.
## Known, unknown, unproven
Real two-driver comparison is unverified.
## Verification
Independent source review passed; deployment not checked.
## Acceptance
Pending merge; full packet criteria incomplete.
"""
FINAL = TEXT.replace("See PR #10.", "| C1 | Port assignment repaired | E1 |", 1)
FINAL = FINAL.replace("See PR #10.", "| E1 | Regression | pytest tests/test_driver_review.py |", 1)
PATH = "work/WP-002-two-drivers.md"


def run(tmp_path, text=TEXT, *, touched=True, draft=True, body="Workpackets: WP-002"):
    (tmp_path / "work").mkdir(exist_ok=True)
    (tmp_path / PATH).write_text(text, encoding="utf-8")
    changed = ["app/telemetry/listener.py"] + ([PATH] if touched else [])
    return guard.check(changed, body, draft, tmp_path)


def test_open_packet_locates_pr_without_duplicating_final_evidence(tmp_path):
    assert run(tmp_path) == []


def test_code_change_without_packet_change_fails(tmp_path):
    assert any("update work/" in e for e in run(tmp_path, touched=False))


@pytest.mark.parametrize("old,new,expected", [
    ("| Status | partial |", "| Status | draft |", "status"),
    ("next: private deployment checks.", "Not started.", "checkpoint"),
    ("Codex (checkpoint owner); original work by GPT-6", "—", "owner"),
])
def test_observed_stale_records_fail(tmp_path, old, new, expected):
    assert any(expected in e for e in run(tmp_path, TEXT.replace(old, new)))


def test_declaration_cannot_omit_changed_isolated_module(tmp_path):
    assert any("requires declared WP-002" in e for e in run(tmp_path, body="Workpackets: WP-005"))


def test_missing_declaration_fails_even_when_packet_touched(tmp_path):
    assert any("Workpackets:" in e for e in run(tmp_path, body="No milestones specified."))


def test_ready_pr_cannot_leave_evidence_only_in_private_pr(tmp_path):
    assert sum("final" in e for e in run(tmp_path, draft=False)) == 2


def test_ready_partial_packet_with_truthful_final_evidence_passes(tmp_path):
    assert run(tmp_path, FINAL, draft=False) == []


def test_empty_evidence_cells_do_not_count_as_final(tmp_path):
    bad = FINAL.replace("pytest tests/test_driver_review.py", " ")
    assert any("final Evidence" in e for e in run(tmp_path, bad, draft=False))


def test_docs_only_change_does_not_require_a_product_packet(tmp_path):
    assert guard.check(["docs/WORKPACKETS.md"], "", False, tmp_path) == []
