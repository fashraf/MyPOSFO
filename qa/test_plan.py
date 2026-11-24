"""Prints the test plan (every test case, how it runs, the passing result, where to fix) as Markdown.
  python qa/test_plan.py [qa-out/findings.json] > qa/TEST_PLAN.md
With a findings file, adds the result of that run."""
from __future__ import annotations
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from checks import api, database, frontend, health  # noqa: E402
from checks.common import SUITE_VERSION, LAYER  # noqa: E402

res = {}
meta = {}
if len(sys.argv) > 1:
    d = json.load(open(sys.argv[1], encoding="utf-8")); meta = d.get("meta", {})
    res = {r["id"]: (r["status"], r["detail"]) for r in d["results"]}
print(f"# MyPOS test plan — suite v{SUITE_VERSION}\n")
if meta:
    print(f"Results from: {meta.get('subtitle', '')}\n")
for name, mod in (("Front end (FO)", frontend), ("API", api), ("Database (DB)", database), ("Hourly health (Ops)", health)):
    print(f"## {name}\n")
    print("| ID | Severity | Test case | Steps | Expected | Result | Where to fix |")
    print("| --- | --- | --- | --- | --- | --- | --- |")
    for c in sorted(mod.C.values(), key=lambda c: c.id):
        st = res.get(c.id, ("not run", ""))[0]
        print(f"| {c.id} | {c.severity} | {c.checks} | {c.steps} | {c.expected} | {st} | {c.fix} |".replace("\n", " "))
    print()
