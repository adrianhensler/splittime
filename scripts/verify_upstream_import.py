#!/usr/bin/env python3
"""Check that an import commit holds upstream LapScope byte for byte.

Usage: scripts/verify_upstream_import.py <upstream-checkout> <upstream-commit> <import-commit>

Compares git blob ids, so no working tree is read. Upstream's root documents
and docs/ live under docs/upstream/ here; the two Git LFS .gif files are not
imported. Exits non-zero on any difference.
"""
import subprocess
import sys

ROOT_DOCS = {"README.md", "AGENTS.md", "ARCHITECTURE.md", "CODE_OF_CONDUCT.md",
             "CONTRIBUTING.md", "LICENSE"}


def tree(repo: str, commit: str) -> dict[str, str]:
    out = subprocess.run(["git", "-C", repo, "ls-tree", "-r", commit],
                         check=True, capture_output=True, text=True).stdout
    blobs = {}
    for line in out.splitlines():
        meta, path = line.split("\t", 1)
        blobs[path] = meta.split()[2]
    return blobs


def mapped(path: str) -> str | None:
    if path.endswith(".gif"):
        return None
    if path in ROOT_DOCS:
        return "docs/upstream/" + path
    if path.startswith("docs/"):
        return "docs/upstream/" + path[len("docs/"):]
    return path


def main() -> int:
    upstream_repo, upstream_commit, import_commit = sys.argv[1:4]
    theirs = tree(upstream_repo, upstream_commit)
    ours = tree(".", import_commit)
    bad = checked = skipped = 0
    for path, blob in sorted(theirs.items()):
        target = mapped(path)
        if target is None:
            skipped += 1
            continue
        checked += 1
        if ours.get(target) != blob:
            print(f"DIFFERS: {path} -> {target}")
            bad += 1
    print(f"checked {checked}, skipped {skipped} (LFS .gif), differing {bad}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
