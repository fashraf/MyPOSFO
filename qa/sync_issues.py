"""Keeps one GitHub issue per finding: opens new ones, comments on ones still failing, closes ones that now pass.
Needs the gh CLI and GH_TOKEN. Issues are labelled qa + auto + the severity, titled "[ID] title"."""
from __future__ import annotations
import argparse, json, subprocess, sys


def gh(*args, input=None):
    return subprocess.run(["gh", *args], input=input, capture_output=True, text=True, check=False)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("findings"); ap.add_argument("--run-url", default="")
    a = ap.parse_args()
    data = json.load(open(a.findings, encoding="utf-8"))
    results = {r["id"]: r for r in data["results"]}
    for label, color in (("qa", "0b6b4f"), ("auto", "6b7280"), ("Major", "b91c1c"), ("Moderate", "c2410c"), ("Minor", "a16207")):
        gh("label", "create", label, "--color", color, "--force")
    listed = gh("issue", "list", "--label", "qa,auto", "--state", "open", "--limit", "200", "--json", "number,title")
    open_issues = {}
    for i in json.loads(listed.stdout or "[]"):
        if i["title"].startswith("[") and "]" in i["title"]:
            open_issues[i["title"][1:i["title"].index("]")]] = i["number"]
    run = data["meta"]["subtitle"]
    fixed, opened, still = [], [], []
    for cid, r in results.items():
        if r["status"] == "fail":
            body = (f"**{r['severity']} · {r['area']}**\n\n{r['detail']}\n\n**Expected:** {r['expected']}\n\n**Where to fix:** {r['fix']}\n\n"
                    f"**Re-test:** {r['steps']}\n\nSeen in: {run}\n{a.run_url}\n\nTo fix, tell Claude: `Fix {cid}`")
            if cid in open_issues:
                gh("issue", "comment", str(open_issues[cid]), "--body", f"Still failing — {run}\n\n{r['detail']}\n{a.run_url}"); still.append(cid)
            else:
                gh("issue", "create", "--title", f"[{cid}] {r['title']}", "--label", f"qa,auto,{r['severity']}", "--body", body); opened.append(cid)
        elif r["status"] == "pass" and cid in open_issues:
            gh("issue", "close", str(open_issues[cid]), "--comment", f"✅ Fixed — passes in {run}\n{a.run_url}"); fixed.append(cid)
    with open(a.findings.replace("findings.json", "summary.md"), "a", encoding="utf-8") as f:
        f.write(f"\n**Issues:** new {', '.join(opened) or '—'} · still open {', '.join(still) or '—'} · fixed and closed {', '.join(fixed) or '—'}\n")
    print("opened", opened, "still", still, "fixed", fixed)


if __name__ == "__main__":
    sys.exit(main())
