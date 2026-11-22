"""Sign in as every predefined persona via the login drawer; check landing, nav, errors, network."""
import sys, json
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/tmp/personas"
LANG = sys.argv[3] if len(sys.argv) > 3 else "en"
EMAILS = ["owner@alnoor.sa", "manager@alnoor.sa", "cashier@alnoor.sa", "kitchen@alnoor.sa",
          "accountant@alnoor.sa", "admin@najdmarket.sa", "cashier@najdmarket.sa", "stock@najdmarket.sa"]
FORBIDDEN_PROBES = {"cashier@alnoor.sa": "/finance/profit-loss", "kitchen@alnoor.sa": "/pos",
                    "manager@alnoor.sa": "/roles"}

problems = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    for email in EMAILS:
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        ctx.add_init_script(f"localStorage.setItem('app.language', '{LANG}')")
        page = ctx.new_page()
        errs, net = [], []
        page.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" else None)
        page.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)[:200]))
        def onreq(r):
            u = urlparse(r.url)
            if r.url.startswith("data:") or r.url.startswith("blob:"): return
            if u.path.startswith("/api/") or not r.url.startswith(BASE): net.append(r.url)
        page.on("request", onreq)
        page.goto(BASE + "/login")
        page.wait_for_timeout(900)
        page.get_by_text(email, exact=True).first.click()
        page.wait_for_timeout(2200)
        landing = urlparse(page.url).path
        nav = page.locator("aside nav a").all_inner_texts()
        nav = [n.strip() for n in nav if n.strip()]
        shot = f"{OUT}/{email.split('@')[0]}_{email.split('@')[1].split('.')[0]}.png"
        page.screenshot(path=shot)
        probe = None
        if email in FORBIDDEN_PROBES:
            page.goto(BASE + FORBIDDEN_PROBES[email])
            page.wait_for_timeout(1200)
            probe = "403" in page.inner_text("main")
        print(json.dumps({"email": email, "landing": landing, "nav": nav, "forbiddenBlocked": probe,
                          "errors": errs[:3], "network": net[:3]}, ensure_ascii=False))
        if errs or net: problems.append(email)
        ctx.close()
    browser.close()
print("PROBLEMS:", problems)
