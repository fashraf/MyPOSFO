"""Turns sanity results into the issue report: summary cards, one issue per page with its screenshot, then every check run."""
from __future__ import annotations
import base64, html
from pathlib import Path
from playwright.sync_api import sync_playwright
from checks.common import Result, SEVERITIES

CSS = """
@page { size: A4; margin: 18mm 16mm 18mm 16mm; }
* { box-sizing: border-box; }
body { font-family: "Helvetica Neue", Arial, "Noto Sans Arabic", sans-serif; color: #1f2937; margin: 0; }
h1 { color: #0b6b4f; font-size: 26px; margin: 0 0 4px; }
.sub { color: #6b7280; font-size: 12px; margin-bottom: 18px; }
.cards { display: flex; border: 1px solid #e5e7eb; border-radius: 4px; overflow: hidden; margin-bottom: 26px; }
.card { flex: 1; text-align: center; padding: 10px 0; border-right: 1px solid #e5e7eb; }
.card:last-child { border-right: 0; }
.card .l { font-size: 11px; font-weight: 600; } .card .n { font-size: 20px; font-weight: 700; }
.Major { background: #fde2e2; } .Major .l, .Major .n { color: #b91c1c; }
.Moderate { background: #fff7e6; } .Moderate .l, .Moderate .n { color: #c2410c; }
.Minor { background: #fff9db; } .Minor .l, .Minor .n { color: #a16207; }
.Pass { background: #e8f6ef; } .Pass .l, .Pass .n { color: #0b6b4f; }
h2 { font-size: 16px; margin: 0 0 12px; }
.issue { page-break-before: always; } .issue.first { page-break-before: auto; }
.badge { display: inline-block; font-size: 11px; font-weight: 600; padding: 4px 18px; border: 1px solid; margin-right: 8px; }
.badge.Major { color: #b91c1c; border-color: #b91c1c; } .badge.Moderate { color: #c2410c; border-color: #c2410c; } .badge.Minor { color: #a16207; border-color: #a16207; }
.id { color: #6b7280; font-size: 11px; font-weight: 600; }
.issue h3 { font-size: 19px; margin: 12px 0 6px; } .issue p { font-size: 13px; line-height: 1.45; margin: 0 0 14px; }
.area { color: #6b7280; font-size: 11px; }
.shot { text-align: center; } .shot img { max-width: 100%; max-height: 165mm; border: 1px solid #e5e7eb; }
table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
td:first-child { white-space: nowrap; }
th, td { text-align: left; padding: 5px 6px; border-bottom: 1px solid #eef0f2; vertical-align: top; }
th { color: #6b7280; font-weight: 600; }
.st-pass { color: #0b6b4f; font-weight: 600; } .st-fail { color: #b91c1c; font-weight: 600; } .st-skip { color: #6b7280; }
.clean { padding: 30px; text-align: center; color: #0b6b4f; font-size: 16px; border: 1px dashed #9fd8bf; border-radius: 6px; }
"""


def _img(path: str | None) -> str:
    if not path or not Path(path).exists():
        return ""
    data = base64.b64encode(Path(path).read_bytes()).decode()
    return f'<div class="shot"><img src="data:image/png;base64,{data}"></div>'


def build_html(results: list[Result], meta: dict) -> str:
    e = html.escape
    fails = [r for r in results if r.status == "fail"]
    order = {s: i for i, s in enumerate(SEVERITIES)}
    fails.sort(key=lambda r: (order[r.check.severity], r.check.id))
    counts = {s: sum(1 for r in fails if r.check.severity == s) for s in SEVERITIES}
    passed = sum(1 for r in results if r.status == "pass")
    out = [f"<html><head><meta charset='utf-8'><style>{CSS}</style></head><body>",
           f"<h1>{e(meta['title'])}</h1>",
           f"<div class='sub'>{e(meta['subtitle'])}</div>",
           "<div class='cards'>" + "".join(f"<div class='card {s}'><div class='l'>{s}</div><div class='n'>{counts[s]}</div></div>" for s in SEVERITIES)
           + f"<div class='card Pass'><div class='l'>Passed</div><div class='n'>{passed}/{len(results)}</div></div></div>"]
    if not fails:
        out.append("<div class='clean'>No issues found. Every check passed or was skipped (see the list below).</div>")
    first, current = True, None
    for r in fails:
        heading = f"<h2>{r.check.severity} Issues</h2>" if r.check.severity != current else ""
        current = r.check.severity
        out.append(f"<div class='issue{' first' if first else ''}'>{heading}"
                   f"<span class='badge {r.check.severity}'>{r.check.severity}</span><span class='id'>{e(r.check.id)}</span>"
                   f"<h3>{e(r.check.title)}</h3><div class='area'>{e(r.check.area)}</div><p>{e(r.detail)}</p>{_img(r.screenshot)}</div>")
        first = False
    out.append("<div class='issue'><h2>Checks run</h2><table><tr><th>ID</th><th>Area</th><th>What is checked</th><th>Result</th><th>Seen</th></tr>")
    for r in sorted(results, key=lambda r: r.check.id):
        out.append(f"<tr><td>{e(r.check.id)}</td><td>{e(r.check.area)}</td><td>{e(r.check.checks)}</td>"
                   f"<td class='st-{r.status}'>{r.status}</td><td>{e(r.detail)}</td></tr>")
    out.append("</table></div></body></html>")
    return "".join(out)


def write(results: list[Result], meta: dict, out: Path) -> Path:
    page_html = build_html(results, meta)
    (out / "report.html").write_text(page_html, encoding="utf-8")
    pdf = out / meta["file"]
    footer = (f"<div style='font-size:8px;color:#9ca3af;width:100%;padding:0 16mm;display:flex;justify-content:space-between;font-family:Arial'>"
              f"<span>{html.escape(meta['title'])}</span><span>Page <span class='pageNumber'></span></span></div>")
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page()
        pg.set_content(page_html, wait_until="load")
        pg.pdf(path=str(pdf), format="A4", print_background=True, display_header_footer=True,
               header_template="<span></span>", footer_template=footer, margin={"top": "18mm", "bottom": "18mm", "left": "16mm", "right": "16mm"})
        b.close()
    return pdf
