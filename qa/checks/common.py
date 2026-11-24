"""Shared types for the sanity suite. Every check has a fixed ID, so the same problem keeps the same ID run after run
(that is what lets the GitHub issue for it be updated, and closed automatically once it stops happening)."""
from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import Optional

SEVERITIES = ("Major", "Moderate", "Minor")


@dataclass
class Check:
    id: str            # e.g. WEB-MAJ-04 — never reuse an ID for a different check
    severity: str      # Major | Moderate | Minor
    area: str          # Frontend | API | Database
    title: str         # the problem, phrased as it reads in the report when the check fails
    checks: str        # what is verified, shown in the "Checks run" table


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
