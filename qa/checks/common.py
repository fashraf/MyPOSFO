"""Shared types for the sanity suite. Every check has a fixed ID, so the same problem keeps the same ID run after run
(that is what lets the GitHub issue for it be updated, and closed automatically once it stops happening)."""
from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import Optional

SUITE_VERSION = "1.3.0"   # bump when checks are added or changed; printed on every report
SEVERITIES = ("Major", "Moderate", "Minor")
LAYER = {"Frontend": "FO", "API": "API", "Database": "DB", "Health": "Ops"}


@dataclass
class Check:
    id: str            # e.g. WEB-MAJ-04 — never reuse an ID for a different check
    severity: str      # Major | Moderate | Minor
    area: str          # Frontend | API | Database
    title: str         # the problem, phrased as it reads in the report when the check fails
    checks: str        # what is verified, shown in the "Checks run" table
    steps: str = ""    # how the test runs (also the manual steps a person can repeat)
    expected: str = "" # the passing result
    fix: str = ""      # where to look when it fails: layer, file, function/line


@dataclass
class Result:
    check: Check
    status: str                      # pass | fail | skip
    detail: str = ""                 # one or two sentences: what was seen
    screenshot: Optional[str] = None
    extra: dict = field(default_factory=dict)

    def to_json(self) -> dict:
        d = asdict(self)
        d.update(d.pop("check"))
        return d
