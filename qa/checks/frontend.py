"""Front-end sanity: what a cashier and an owner actually do, on desktop and on a 360×720 handheld."""
from __future__ import annotations
import re, time
from pathlib import Path
from playwright.sync_api import sync_playwright, Page, BrowserContext, TimeoutError as PWTimeout
from .common import Check, Result

C = {c.id: c for c in [
    Check("WEB-MAJ-01", "Major", "Frontend", "The app does not load",
          "Login screen opens within 15 s without script errors"),
    Check("WEB-MAJ-02", "Major", "Frontend", "Owner cannot sign in",
          "Owner signs in and the dashboard opens"),
    Check("WEB-MAJ-03", "Major", "Frontend", "A cash sale cannot be completed",
          "Cashier sells an item for cash; the done screen shows a numeric order number and the change"),
    Check("WEB-MAJ-04", "Major", "Frontend", "Charge button is covered on the handheld screen",
          "At 360×720 the Charge button is visible and nothing sits on top of it"),
    Check("WEB-MAJ-05", "Major", "Frontend", "Malformed cash amount is accepted",
          "Typing 1.5abc as cash received is cleaned or rejected, and checkout stays blocked while cash is short"),
    Check("WEB-MOD-01", "Moderate", "Frontend", "Some pages fail to open",
          "Every page in the owner's menu opens without a crash or error screen"),
    Check("WEB-MOD-02", "Moderate", "Frontend", "Pages overflow sideways on the phone",
          "Main pages fit a 360 px wide phone without sideways scrolling"),
    Check("WEB-MOD-03", "Moderate", "Frontend", "Arabic layout is broken",
          "Arabic switches the app to right-to-left with Arabic text"),
    Check("WEB-MOD-04", "Moderate", "Frontend", "New sale is missing from the Sales list",
          "The sale just made appears in Sales"),
    Check("WEB-MIN-01", "Minor", "Frontend", "Untranslated text keys are visible",
          "No raw translation keys (like checkout.payment.title) on any page"),
    Check("WEB-MIN-02", "Minor", "Frontend", "Pages log errors in the browser console",
          "No console errors while browsing every page"),
    Check("WEB-MIN-03", "Minor", "Frontend", "First load is slow",
          "Login screen is usable within 5 s"),
]}

PHONE = {"width": 360, "height": 720}
DESKTOP = {"width": 1440, "height": 900}
KEY_RE = re.compile(r"(?<![@\w.])[a-z][a-zA-Z0-9]+(?:\.[a-z][a-zA-Z0-9]+){2,}\b")
NOISE = ("favicon", "net::ERR_ABORTED", "Download the React DevTools")


class Run:
    def __init__(self, base: str, out: Path):
        self.base = base.rstrip("/")
        self.out = out
        self.shots = out / "shots"
        self.shots.mkdir(parents=True, exist_ok=True)
        self.results: list[Result] = []

    # ------------------------------------------------------------------ helpers
    def ctx(self, browser, viewport, lang="en", mobile=False) -> BrowserContext:
        c = browser.new_context(viewport=viewport, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1)
        c.add_init_script(f"try{{localStorage.setItem('app.language','{lang}')}}catch(e){{}}")
        return c

    def shot(self, page: Page, name: str) -> str:
        p = self.shots / f"{name}.png"
        page.screenshot(path=str(p))
        return str(p)

    def add(self, cid, status, detail="", screenshot=None, **extra):
        self.results.append(Result(C[cid], status, detail, screenshot, extra))

    def login_email(self, page: Page, email: str):
        page.goto(self.base + "/login")
        page.wait_for_load_state("networkidle")
        persona = page.get_by_text(email, exact=True).first
        if not persona.is_visible():
            toggle = page.get_by_test_id("personas-toggle")
            if toggle.count() and toggle.is_visible():
                toggle.click()
        if persona.is_visible():
            persona.click()
        else:  # real login form (api mode)
            page.locator("input[type=email], input[name=email], input[autocomplete=username]").first.fill(email)
            page.locator("input[type=password]").first.fill("Demo@1234")
            page.locator("button[type=submit]").first.click()
        page.wait_for_url(lambda u: "/login" not in u, timeout=15000)
        page.wait_for_load_state("networkidle")

    def login_pin(self, page: Page, pin: str):
        page.goto(self.base + "/login")
        page.wait_for_load_state("networkidle")
        tab = page.get_by_role("tab", name="Staff PIN")
        if tab.count() and tab.is_visible():
            tab.click()
        for d in pin:
            page.get_by_role("button", name=d, exact=True).click()
        page.wait_for_url(lambda u: "/login" not in u, timeout=15000)
        page.wait_for_load_state("networkidle")

    def add_item(self, page: Page, name="Butter Croissant"):
        page.get_by_role("button", name=name).first.click()
        page.wait_for_timeout(400)
        dlg = page.locator("[role=dialog] button", has_text="Add")
        if dlg.count():
            dlg.last.click()
            page.wait_for_timeout(300)

    # ------------------------------------------------------------------- checks
    def run(self):
        with sync_playwright() as p:
            browser = p.chromium.launch()
            try:
                self.boot(browser)
                if self.results[-1].status != "pass":
                    for cid in C:
                        if not any(r.check.id == cid for r in self.results):
                            self.add(cid, "skip", "Skipped: the app did not load.")
                    return self.results
                self.sale_desktop(browser)
                self.phone_charge(browser)
                self.cash_input(browser)
                self.owner_pages(browser)
                self.phone_overflow(browser)
                self.arabic(browser)
            finally:
                browser.close()
        return self.results

    def boot(self, browser):
        c = self.ctx(browser, DESKTOP); page = c.new_page(); errors = []
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))
        t0 = time.time()
        try:
            page.goto(self.base + "/login", timeout=30000)
            page.get_by_role("button").first.wait_for(timeout=15000)
            secs = time.time() - t0
            self.add("WEB-MIN-03", "pass" if secs <= 5 else "fail", f"Login screen was usable after {secs:.1f} s.",
                     None if secs <= 5 else self.shot(page, "WEB-MIN-03"))
            if errors:
                self.add("WEB-MAJ-01", "fail", "The login screen raised script errors: " + "; ".join(errors[:2]), self.shot(page, "WEB-MAJ-01"))
            else:
                self.add("WEB-MAJ-01", "pass", f"Login screen opened at {self.base}.")
        except Exception as e:  # noqa: BLE001
            self.add("WEB-MIN-03", "skip", "Skipped: the login screen never appeared.")
            self.add("WEB-MAJ-01", "fail", f"The login screen did not appear within 15 s at {self.base} ({type(e).__name__}).",
                     self.shot(page, "WEB-MAJ-01"))
        c.close()

    def sale_desktop(self, browser):
        c = self.ctx(browser, DESKTOP); page = c.new_page()
        try:
            self.login_pin(page, "1111")
            self.add_item(page)
            page.get_by_role("button", name="Charge").first.click(); page.wait_for_timeout(700)
            page.get_by_role("button", name="Exact").click(); page.wait_for_timeout(300)
            page.locator("[role=dialog] button").filter(has_text="Complete").last.click(); page.wait_for_timeout(500)
            page.get_by_role("button", name="Place order").click()
            no = page.get_by_test_id("done-order-no")
            no.wait_for(timeout=15000)
            order_no = no.inner_text().strip()
            body = page.locator("body").inner_text()
            inv = re.search(r"\b(1\d{5,})\b", body)
            if not re.fullmatch(r"#\d+", order_no):
                self.add("WEB-MAJ-03", "fail", f"The sale completed but the order number shows as “{order_no}” instead of a number.", self.shot(page, "WEB-MAJ-03"))
            else:
                self.add("WEB-MAJ-03", "pass", f"Cash sale completed: order {order_no}" + (f", invoice {inv.group(1)}." if inv else "."))
            if inv:
                page.goto(self.base + "/sales"); page.wait_for_load_state("networkidle"); page.wait_for_timeout(800)
                found = page.get_by_text(inv.group(1)).filter(visible=True).count() > 0
                self.add("WEB-MOD-04", "pass" if found else "fail",
                         f"Invoice {inv.group(1)} {'is listed' if found else 'does not appear'} in Sales right after the sale.",
                         None if found else self.shot(page, "WEB-MOD-04"))
            else:
                self.add("WEB-MOD-04", "skip", "Skipped: no invoice number was visible on the done screen.")
        except Exception as e:  # noqa: BLE001
            self.add("WEB-MAJ-03", "fail", f"The cash sale could not be finished on desktop ({type(e).__name__}: {str(e).splitlines()[0][:140]}).",
                     self.shot(page, "WEB-MAJ-03"))
            self.add("WEB-MOD-04", "skip", "Skipped: no sale was made.")
        c.close()

    def phone_charge(self, browser):
        c = self.ctx(browser, PHONE, mobile=True); page = c.new_page()
        try:
            self.login_pin(page, "1111")
            self.add_item(page)
            btn = page.get_by_test_id("phone-charge")
            if not btn.count():
                btn = page.get_by_role("button", name="Charge").first
            box = btn.bounding_box()
            if not box or not btn.is_visible():
                self.add("WEB-MAJ-04", "fail", "At 360×720 the Charge button is not visible after adding an item.", self.shot(page, "WEB-MAJ-04")); c.close(); return
            covered = page.evaluate("""([x, y, w, h]) => {
                const el = document.querySelector('[data-testid=phone-charge]') || [...document.querySelectorAll('button')].find(b => /Charge/.test(b.innerText));
                const pts = [[x + w / 2, y + h / 2], [x + 8, y + h / 2], [x + w - 8, y + h / 2]];
                return pts.filter(([px, py]) => { const t = document.elementFromPoint(px, py); return !(t && (t === el || el.contains(t))); }).length;
            }""", [box["x"], box["y"], box["width"], box["height"]])
            inside = box["y"] + box["height"] <= PHONE["height"] + 1
            if covered or not inside:
                self.add("WEB-MAJ-04", "fail",
                         "At the 360×720 handheld viewport, " + ("another element covers the Charge button" if covered else "the Charge button sits below the bottom of the screen")
                         + " and blocks normal checkout.", self.shot(page, "WEB-MAJ-04"))
            else:
                self.add("WEB-MAJ-04", "pass", "Charge button fully visible and tappable at 360×720.")
        except Exception as e:  # noqa: BLE001
            self.add("WEB-MAJ-04", "fail", f"Could not reach the Charge button on the phone ({type(e).__name__}).", self.shot(page, "WEB-MAJ-04"))
        c.close()

    def cash_input(self, browser):
        c = self.ctx(browser, DESKTOP); page = c.new_page()
        try:
            self.login_pin(page, "1111")
            self.add_item(page)
            page.get_by_role("button", name="Charge").first.click(); page.wait_for_timeout(700)
            field = page.get_by_label(re.compile("Amount received|Cash received", re.I)).first
            if not field.count():
                field = page.locator("[role=dialog] input[inputmode=decimal]").last
            field.click(); field.fill(""); page.keyboard.type("1.5abc"); page.wait_for_timeout(300)
            value = field.input_value()
            complete = page.locator("[role=dialog] button").filter(has_text="Complete").last
            enabled = complete.is_enabled()
            if re.search(r"[A-Za-z]", value) or enabled:
                self.add("WEB-MAJ-05", "fail",
                         f"Checkout accepts “{value}” as cash received" + (" and still allows completing the sale although the cash is short." if enabled else "."),
                         self.shot(page, "WEB-MAJ-05"))
            else:
                self.add("WEB-MAJ-05", "pass", f"“1.5abc” became “{value}” and Complete stays disabled while cash is short.")
        except Exception as e:  # noqa: BLE001
            self.add("WEB-MAJ-05", "skip", f"Skipped: could not reach the cash field ({type(e).__name__}).")
        c.close()

    def owner_pages(self, browser):
        c = self.ctx(browser, DESKTOP); page = c.new_page()
        console, crashes = [], []
        page.on("console", lambda m: console.append((page.url, m.text[:160])) if m.type == "error" and not any(n in m.text for n in NOISE) else None)
        page.on("pageerror", lambda e: crashes.append((page.url, str(e)[:160])))
        try:
            self.login_email(page, "owner@lazeez.sa")
            ok = page.locator("main, [role=main]").first.inner_text(timeout=8000)
            self.add("WEB-MAJ-02", "pass" if ok.strip() else "fail", f"Owner signed in and landed on {page.url.replace(self.base, '') or '/'}.")
        except Exception as e:  # noqa: BLE001
            self.add("WEB-MAJ-02", "fail", f"The owner could not sign in ({type(e).__name__}).", self.shot(page, "WEB-MAJ-02"))
            for cid in ("WEB-MOD-01", "WEB-MIN-01", "WEB-MIN-02"):
                self.add(cid, "skip", "Skipped: owner could not sign in.")
            c.close(); return
        try:
            page.locator("nav a[href^='/']").first.wait_for(timeout=10000)
        except PWTimeout:
            pass
        links = page.eval_on_selector_all("nav a[href^='/'], aside a[href^='/']", "els => [...new Set(els.map(e => e.getAttribute('href')))]")
        links = [l for l in links if l and not l.startswith(("/login", "/components"))][:40]
        broken, keys, first_shot = [], {}, None
        for href in links:
            before = len(crashes)
            try:
                page.goto(self.base + href, timeout=20000); page.wait_for_load_state("networkidle", timeout=15000); page.wait_for_timeout(300)
                text = page.locator("body").inner_text()
            except PWTimeout:
                broken.append(f"{href} (timed out)"); continue
            if len(crashes) > before or re.search(r"Something went wrong|Unexpected Application Error", text):
                broken.append(href)
                first_shot = first_shot or self.shot(page, "WEB-MOD-01")
            found = sorted(set(KEY_RE.findall(text)) - {"window.__pos"})
            if found:
                keys[href] = found[:4]
                if len(keys) == 1:
                    self.shot(page, "WEB-MIN-01")
        self.add("WEB-MOD-01", "fail" if broken else "pass",
                 (f"{len(broken)} of {len(links)} pages crashed or showed an error: " + ", ".join(broken[:8]) + ".") if broken else f"All {len(links)} menu pages opened.",
                 first_shot, pages=broken)
        if keys:
            sample = "; ".join(f"{h}: {', '.join(v)}" for h, v in list(keys.items())[:4])
            self.add("WEB-MIN-01", "fail", f"Raw translation keys are shown instead of text on {len(keys)} page(s) — {sample}.",
                     str(self.shots / "WEB-MIN-01.png") if (self.shots / "WEB-MIN-01.png").exists() else None)
        else:
            self.add("WEB-MIN-01", "pass", f"No raw translation keys on {len(links)} pages.")
        if console:
            uniq = list(dict.fromkeys(f"{u.replace(self.base, '')}: {t}" for u, t in console))
            self.add("WEB-MIN-02", "fail", f"{len(uniq)} distinct console error(s), e.g. " + " | ".join(uniq[:3]))
        else:
            self.add("WEB-MIN-02", "pass", "No console errors while browsing.")
        c.close()

    def phone_overflow(self, browser):
        c = self.ctx(browser, PHONE, mobile=True); page = c.new_page()
        try:
            self.login_email(page, "owner@lazeez.sa")
            bad, shot = [], None
            for href in ["/dashboard", "/pos", "/sales", "/catalog", "/customers", "/kitchen", "/restaurant", "/settings"]:
                page.goto(self.base + href); page.wait_for_load_state("networkidle"); page.wait_for_timeout(400)
                over = page.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
                if over > 2:
                    bad.append(f"{href} (+{over}px)")
                    shot = shot or self.shot(page, "WEB-MOD-02")
            self.add("WEB-MOD-02", "fail" if bad else "pass",
                     ("These pages scroll sideways on a 360 px phone: " + ", ".join(bad) + ".") if bad else "Main pages fit a 360 px phone.", shot)
        except Exception as e:  # noqa: BLE001
            self.add("WEB-MOD-02", "skip", f"Skipped: could not sign in on the phone ({type(e).__name__}).")
        c.close()

    def arabic(self, browser):
        c = self.ctx(browser, DESKTOP, lang="ar"); page = c.new_page()
        try:
            self.login_email(page, "owner@lazeez.sa")
            d = page.evaluate("() => [document.documentElement.dir, document.documentElement.lang]")
            text = page.locator("main, [role=main]").first.inner_text()
            arabic = len(re.findall(r"[؀-ۿ]", text)); latin = len(re.findall(r"[A-Za-z]", text))
            if d[0] != "rtl" or arabic < latin:
                self.add("WEB-MOD-03", "fail", f"In Arabic the page direction is “{d[0] or 'ltr'}” and {latin} Latin vs {arabic} Arabic letters are shown.",
                         self.shot(page, "WEB-MOD-03"))
            else:
                self.add("WEB-MOD-03", "pass", "Arabic switches to right-to-left with Arabic text.")
        except Exception as e:  # noqa: BLE001
            self.add("WEB-MOD-03", "skip", f"Skipped: could not sign in in Arabic ({type(e).__name__}).")
        c.close()


def run(base: str, out: Path) -> list[Result]:
    return Run(base, out).run()
