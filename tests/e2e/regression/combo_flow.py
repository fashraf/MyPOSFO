"""Lazeez: build a meal (Fanta swap, large fries), pay, check KDS + stock, edit order, cancel order, print dialog."""
import json
from playwright.sync_api import sync_playwright

B = "http://localhost:5173"
OUT = "/tmp/combo"

def db(page, key):
    return page.evaluate(f"""() => {{
      const k = Object.keys(localStorage).find(k => k.startsWith('poscomplete.mockdb') && k.endsWith('ten_lazeez'));
      const d = JSON.parse(localStorage.getItem(k)); const s = d.slices;
      return {{ sales: s.sales.sales.slice(0,3).map(x => ({{inv:x.invoiceNumber,total:x.totalH,status:x.status,repl:x.replacesInvoice,by:x.replacedByInvoice,refund:x.refundH,pay:x.payments, comps:(x.lines[0].components||[]).map(c=>c.nameEn+(c.modifiers?'/'+c.modifiers.map(m=>m.nameEn).join('+'):''))}})),
               fanta: s.catalog.branchStock.itm_013, fries: s.catalog.branchStock.itm_007,
               kitchen: s.kitchen.orders.map(o => o.orderNumber + ':' + o.items.map(i => i.nameEn).join(' | ')) }};
    }}""")

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    ctx.add_init_script("localStorage.setItem('app.language','en')")
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:300]))
    pg.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" else None)
    pg.goto(B + "/login"); pg.wait_for_timeout(800)
    pg.get_by_role("tab", name="Staff PIN").click()
    for d in "4444": pg.get_by_role("button", name=d, exact=True).click()
    pg.wait_for_timeout(2000)
    print("landing", pg.url)
    pg.screenshot(path=f"{OUT}/1_grid.png")
    before = db(pg, 0); print("before fanta/fries", before["fanta"], before["fries"])

    # Plain burger -> make it a meal offer
    pg.get_by_role("button", name="Classic Beef Burger").first.click(); pg.wait_for_timeout(500)
    pg.screenshot(path=f"{OUT}/2_upsell.png")
    pg.locator("[role=dialog] button", has_text="Classic Burger Meal").first.click(); pg.wait_for_timeout(500)
    pg.get_by_role("button", name="Large").first.click()
    pg.locator("[role=dialog] button", has_text="Fanta").first.click()
    pg.get_by_role("button", name="No onion").first.click()
    pg.screenshot(path=f"{OUT}/3_combo.png")
    pg.locator("[role=dialog] button", has_text="Add meal").click(); pg.wait_for_timeout(400)
    pg.screenshot(path=f"{OUT}/4_cart.png")
    pg.get_by_role("button", name="Charge").click(); pg.wait_for_timeout(700)
    pg.get_by_role("button", name="50", exact=True).click(); pg.wait_for_timeout(200)
    pg.locator("[role=dialog] button").filter(has_text="Complete").last.click(); pg.wait_for_timeout(500)
    pg.get_by_role("button", name="Place order").click(); pg.wait_for_timeout(2200)
    pg.screenshot(path=f"{OUT}/5_done.png")
    pg.get_by_role("button", name="Close").last.click(); pg.wait_for_timeout(500)
    print("after close url", pg.url, "cart empty:", "Cart is empty" in pg.inner_text("main"))
    after = db(pg, 0)
    print(json.dumps(after, indent=0)[:1400])

    # Sales -> open the new order
    inv = after["sales"][0]["inv"]
    pg.goto(B + "/sales"); pg.wait_for_timeout(1500)
    pg.get_by_text(inv).filter(visible=True).first.click(); pg.wait_for_timeout(1500)
    pg.screenshot(path=f"{OUT}/6_detail.png")
    pg.get_by_role("button", name="Print").first.click(); pg.wait_for_timeout(1500)
    pg.screenshot(path=f"{OUT}/7_print.png")
    pg.get_by_role("radio", name="Kitchen ticket").click(); pg.wait_for_timeout(900)
    pg.screenshot(path=f"{OUT}/7b_print_kitchen.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)

    # Edit: owner-like perms needed (cashier has no void) -> check edit button absent
    print("cashier sees edit:", pg.get_by_role("button", name="Edit order").count(), "cancel:", pg.get_by_role("button", name="Cancel order").count())
    print("ERRORS", errs[:5])
    b.close()
