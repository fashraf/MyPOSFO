"""Complete sanity run against one environment: database → API → front end, then the PDF report.

  python qa/run_sanity.py --base http://1.2.3.4:8080 --out qa-out
Env: QA_BASE_URL, QA_ENV (staging), QA_TRIGGER (what caused the run), QA_SSH (ssh command for database checks).
Exit code 1 when any Major issue is found."""
from __future__ import annotations
import argparse, json, os, sys, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from checks import api, database, frontend, health  # noqa: E402
from checks.common import SUITE_VERSION  # noqa: E402
import report  # noqa: E402


def fetch(url: str) -> str:
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            return r.read(200).decode().strip()
    except Exception:  # noqa: BLE001
        return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=os.environ.get("QA_BASE_URL", "http://localhost:5173"))
    ap.add_argument("--env", default=os.environ.get("QA_ENV", "staging"))
    ap.add_argument("--out", default="qa-out")
    ap.add_argument("--only", choices=["frontend", "api", "database"], action="append")
    ap.add_argument("--suite", choices=["sanity", "health"], default="sanity", help="health = the quick hourly check")
    a = ap.parse_args()
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    areas = a.only or ["database", "api", "frontend"]

    results = []
    if a.suite == "health":
        print("· health checks"); results += health.run(a.base, a.env); areas = []
    if "database" in areas:
        print("· database checks"); results += database.run(a.env)
    if "api" in areas:
        print("· API checks"); results += api.run(a.base)
    if "frontend" in areas:
        print("· front-end checks (desktop + 360×720 phone)"); results += frontend.run(a.base, out)

    riyadh = datetime.now(timezone.utc) + timedelta(hours=3)
    web_v = fetch(a.base.rstrip("/") + "/version.txt")
    web_v = web_v if web_v and "<" not in web_v else "dev"
    api_v = next((r.extra.get("version") for r in results if r.extra.get("version")), "") or "—"
    trigger = os.environ.get("QA_TRIGGER", "manual run")
    kind = "Health" if a.suite == "health" else "Sanity"
    meta = {
        "title": f"MyPOS {a.env.capitalize()} {kind} Report",
        "subtitle": f"Suite v{SUITE_VERSION} · {a.env} · {trigger} · web {web_v} · api {api_v} · {riyadh:%d %B %Y %H:%M} (Riyadh)",
        "file": f"MyPOS_{a.env.capitalize()}_{kind}_Report_v{SUITE_VERSION}_{riyadh:%Y-%m-%d_%H%M}.pdf",
        "suite_version": SUITE_VERSION, "web_version": web_v, "api_version": api_v,
    }
    (out / "findings.json").write_text(json.dumps({"meta": meta, "base": a.base, "results": [r.to_json() for r in results]}, indent=2), encoding="utf-8")
    pdf = report.write(results, meta, out)

    fails = [r for r in results if r.status == "fail"]
    sev = {s: sum(1 for r in fails if r.check.severity == s) for s in ("Major", "Moderate", "Minor")}
    lines = [f"## {meta['title']}", f"{meta['subtitle']}", "",
             f"**Major {sev['Major']} · Moderate {sev['Moderate']} · Minor {sev['Minor']}** · passed {sum(r.status == 'pass' for r in results)}/{len(results)}", ""]
    lines += [f"- **{r.check.id}** ({r.check.severity}, {r.check.area}) {r.check.title} — {r.detail}  \n  _Where to fix:_ {r.check.fix}" for r in fails] or ["No issues found."]
    lines += ["", f"Report: `{pdf.name}` (download from this run's artifacts)."]
    (out / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    sys.exit(1 if sev["Major"] else 0)


if __name__ == "__main__":
    main()
