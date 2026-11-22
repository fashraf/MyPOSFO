"""End-to-end: cashier sells a Spanish Latte (Large, Oat) + croissant; verify stock, KDS, ZATCA, persistence, isolation."""
import sys, json
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173"
OUT = "/tmp/flow"

def store(page, tenant):
    return page.evaluate(f"""() => {{
      const k = Object.keys(localStorage).find(k => k.startsWith('poscomplete.mockdb') && k.endsWith('{tenant}'));
      if (!k) return null; const d = JSON.parse(localStorage.getItem(k));
      return {{ key: k, size: localStorage.getItem(k).length, sales: d.slices.sales?.sales?.length,
               newest: d.slices.sales?.sales?.[0], kitchen: d.slices.kitchen?.orders?.length,
               croissantStock: d.slices.catalog?.branchStock?.itm_013, icv: d.slices.sales?.zatcaChain?.icv }};
    }}""")

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    ctx.add_init_script("localStorage.setItem('app.language','en')")
    page = ctx.new_page()
    errs = []
    page.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" else None)
    page.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)[:300]))

    page.goto(BASE + "/login"); page.wait_for_timeout(800)
    page.get_by_role("tab", name="Staff PIN").click()
    for d in "1111":
        page.get_by_role("button", name=d, exact=True).click()
    page.wait_for_timeout(2000)
    print("PIN landing:", page.url)
    before = store(page, "ten_alnoor")
    print("before:", json.dumps({k: before[k] for k in ("sales", "kitchen", "croissantStock", "icv", "size")}))

    page.get_by_role("button", name="Spanish Latte").first.click(); page.wait_for_timeout(500)
    page.screenshot(path=f"{OUT}/1_modifiers.png")
    page.get_by_role("button", name="Large").click()
    page.get_by_role("button", name="Oat milk").click()
    page.locator("[role=dialog] button", has_text="Add").last.click(); page.wait_for_timeout(300)
    page.get_by_role("button", name="Butter Croissant").first.click(); page.wait_for_timeout(400)
    page.locator("[role=dialog] button", has_text="Add").last.click(); page.wait_for_timeout(300)
    page.screenshot(path=f"{OUT}/2_cart.png")
    page.get_by_role("button", name="Charge").click(); page.wait_for_timeout(800)
    page.screenshot(path=f"{OUT}/3_checkout.png")
    # confirm payment: last primary button in dialog
    btns = page.locator("[role=dialog] button").all_inner_texts()
    print("checkout buttons:", [x for x in btns if x.strip()][-6:])
    page.get_by_role("button", name="Exact").click(); page.wait_for_timeout(300)
    page.locator("[role=dialog] button").filter(has_text="Complete").last.click()
    page.wait_for_timeout(600)
    page.get_by_role("button", name="Place order").click()
    page.wait_for_timeout(2500)
    page.screenshot(path=f"{OUT}/4_complete.png")
    after = store(page, "ten_alnoor")
    print("after:", json.dumps({k: after[k] for k in ("sales", "kitchen", "croissantStock", "icv")}))
    n = after["newest"]
    print("newest sale:", n["invoiceNumber"], n["totalH"], n["cashierName"], [l["nameEn"] + str(l.get("modifiers", [])[:1] and [m["nameEn"] for m in l["modifiers"]]) for l in n["lines"]], n["zatca"]["icv"], n["zatcaReporting"] if "zatcaReporting" in n else n["zatca"]["reportingStatus"])

    page.reload(); page.wait_for_timeout(2000)
    page.goto(BASE + "/sales"); page.wait_for_timeout(1500)
    print("persisted after reload:", n["invoiceNumber"] in page.inner_text("main"))
    page.screenshot(path=f"{OUT}/5_sales.png")

    # Switch to kitchen persona via demo bar, check ticket present
    page.locator("text=Yousef Al-Harbi").first.click(); page.wait_for_timeout(300)
    page.get_by_role("menuitem").filter(has_text="Barista").click(); page.wait_for_timeout(2000)
    print("kitchen url:", page.url, "ticket shown:", n["invoiceNumber"] in page.inner_text("main"))
    page.screenshot(path=f"{OUT}/6_kitchen.png")

    # Najd isolation
    page.locator("text=Omar Bakri").first.click(); page.wait_for_timeout(300)
    page.get_by_role("menuitem").filter(has_text="Retail Operations Director").click(); page.wait_for_timeout(2200)
    page.goto(BASE + "/sales"); page.wait_for_timeout(1500)
    txt = page.inner_text("main")
    print("najd sees alnoor invoice?", n["invoiceNumber"] in txt and "Spanish" in txt)
    page.goto(BASE + "/pos"); page.wait_for_timeout(1500)
    print("najd catalog has milk:", "Fresh Milk" in page.inner_text("main"), "has latte:", "Spanish Latte" in page.inner_text("main"))
    page.screenshot(path=f"{OUT}/7_najd_pos.png")
    page.goto(BASE + "/zatca"); page.wait_for_timeout(1500)
    page.get_by_role("button", name="Verify hash chain").click(); page.wait_for_timeout(1200)
    print("chain:", page.locator("main [role=alert], main .rounded-lg").first.inner_text()[:120] if page.locator("main").count() else "")
    page.screenshot(path=f"{OUT}/8_zatca.png")
    print("ERRORS:", errs[:5])
    b.close()
