"""Lazeez owner: create a combo + a product with options via the wizard, sell the combo, edit and cancel orders."""
import json, re
from playwright.sync_api import sync_playwright
B = "http://localhost:5173"; OUT = "/tmp/wiz"

def pick(pg, combo, text):
    combo.click(); pg.wait_for_timeout(250)
    pg.keyboard.type(text); pg.wait_for_timeout(250)
    pg.get_by_role("option").filter(has_text=re.compile("^"+re.escape(text))).first.click(); pg.wait_for_timeout(200)

def nxt(pg): pg.locator("[role=dialog] footer button, [role=dialog] button").filter(has_text="Next").last.click(); pg.wait_for_timeout(350)

with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1440, "height": 900})
    ctx.add_init_script("localStorage.setItem('app.language','en')")
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:300]))
    pg.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" else None)
    pg.goto(B + "/login"); pg.wait_for_timeout(900)
    pg.get_by_text("owner@lazeez.sa", exact=True).first.click(); pg.wait_for_timeout(2200)
    pg.goto(B + "/catalog"); pg.wait_for_timeout(1500)
    pg.get_by_role("button", name="Add product").first.click(); pg.wait_for_timeout(700)
    dlg = pg.locator("[role=dialog]")
    pg.screenshot(path=f"{OUT}/1_type.png")
    dlg.locator("button", has_text="Combo meal").click(); nxt(pg)
    print("blocked msg:", "Type a name" in dlg.inner_text())
    dlg.get_by_placeholder("Classic Burger Meal").fill("Wings Feast Meal")
    dlg.get_by_placeholder("0.00").first.fill("30")
    pick(pg, dlg.get_by_role("combobox").first, "Meals")
    pg.screenshot(path=f"{OUT}/2_details.png")
    def part(chip, main, repl=()):
        dlg.locator("button").filter(has_text=re.compile("Add (the first item|item)")).last.click(); pg.wait_for_timeout(500)
        m=pg.locator("[role=dialog]").last
        m.locator("button[aria-pressed]").filter(has_text=re.compile("^"+chip+"$")).first.click()
        pick(pg, m.get_by_role("combobox").filter(has_text="Choose an item").first, main)
        if repl: m.get_by_test_id("part-step-replace").click(); pg.wait_for_timeout(200)
        for item, price in repl:
            pick(pg, m.get_by_role("combobox").filter(has_text="Add a replacement").first, item)
            if price: m.get_by_label("Extra price").last.fill(price)
        m.get_by_test_id("part-step-review").click(); pg.wait_for_timeout(200)
        m.locator("button").filter(has_text="Add to meal").click(); pg.wait_for_timeout(400)
    part("Main", "Spicy Wings"); part("Side", "Fries"); part("Drink", "Coca-Cola", [("Water 330", ""), ("Vanilla Milkshake", "6")])
    pg.screenshot(path=f"{OUT}/3_contents.png", full_page=False)
    print("combo summary:", dlg.locator("div.sticky").first.inner_text().replace("\n"," | "))
    nxt(pg)
    pg.screenshot(path=f"{OUT}/5_review.png")
    dlg.locator("button", has_text="Save item").click(); pg.wait_for_timeout(1500)
    print("dialog closed:", dlg.count() == 0)

    # Product with options
    pg.get_by_role("button", name="Add product").first.click(); pg.wait_for_timeout(700)
    dlg.locator("button", has_text="Product").first.click(); nxt(pg)
    dlg.get_by_placeholder("Cappuccino").fill("Spicy Loaded Fries")
    dlg.get_by_placeholder("0.00").first.fill("14"); nxt(pg)
    dlg.locator("button", has_text="Generate").click(); pg.wait_for_timeout(200)
    print("sku:", dlg.get_by_placeholder("HOT-CAP").input_value())
    print("stock blocker:", "how many you have" in dlg.inner_text())
    dlg.get_by_placeholder("50").fill("40")
    pg.screenshot(path=f"{OUT}/6_stock.png"); nxt(pg); nxt(pg)
    dlg.locator("button").filter(has_text="Size").first.click(); pg.wait_for_timeout(200)
    dlg.locator("button[aria-pressed]").filter(has_text="Regular").first.click(); dlg.locator("button[aria-pressed]").filter(has_text="Large").first.click()
    dlg.get_by_placeholder("0.00").last.fill("3")
    pg.screenshot(path=f"{OUT}/7_options.png"); nxt(pg)
    pg.screenshot(path=f"{OUT}/8_review.png")
    dlg.locator("button", has_text="Save item").click(); pg.wait_for_timeout(1500)
    print("dialog closed:", dlg.count() == 0)

    # Sell it
    pg.goto(B + "/pos"); pg.wait_for_timeout(2000)
    pg.screenshot(path=f"{OUT}/9_grid.png")
    first = pg.locator("main button").filter(has_text="SAR").first.inner_text().split("\n")[0]
    print("first tile:", first)
    pg.get_by_role("button", name="Wings Feast Meal").first.click(); pg.wait_for_timeout(600)
    pg.locator("[role=dialog] button", has_text="Milkshake").first.click()
    pg.screenshot(path=f"{OUT}/10_combo_sheet.png")
    pg.locator("[role=dialog] button", has_text="Add meal").click(); pg.wait_for_timeout(400)
    pg.get_by_role("button", name="Charge").click(); pg.wait_for_timeout(700)
    pg.get_by_role("button", name="50", exact=True).click(); pg.wait_for_timeout(200)
    pg.locator("[role=dialog] button").filter(has_text="Complete").last.click(); pg.wait_for_timeout(500)
    pg.get_by_role("button", name="Place order").click(); pg.wait_for_timeout(2200)
    pg.get_by_role("button", name="Close").last.click(); pg.wait_for_timeout(500)
    sale = pg.evaluate("""() => { const k=Object.keys(localStorage).find(k=>k.endsWith('ten_lazeez')); const s=JSON.parse(localStorage.getItem(k)).slices; const x=s.sales.sales[0];
      return {inv:x.invoiceNumber,total:x.totalH,comps:x.lines[0].components.map(c=>c.nameEn+':'+c.priceDeltaH)} }""")
    print("sale:", sale)

    # Edit as owner (kitchen not started)
    pg.goto(B + "/sales"); pg.wait_for_timeout(1500)
    pg.get_by_text(sale["inv"]).filter(visible=True).first.click(); pg.wait_for_timeout(1500)
    pg.screenshot(path=f"{OUT}/11_detail.png")
    pg.get_by_role("button", name="Edit order").click(); pg.wait_for_timeout(2000)
    print("edit url:", pg.url); pg.screenshot(path=f"{OUT}/12_editing.png")
    pg.get_by_placeholder("Scan barcode").fill("Spicy Loaded"); pg.wait_for_timeout(500)
    pg.get_by_role("button", name="Spicy Loaded Fries").first.click(); pg.wait_for_timeout(500)
    pg.screenshot(path=f"{OUT}/12b_opts.png")
    pg.locator("[role=dialog] button", has_text="Regular").first.click()
    pg.locator("[role=dialog] button").filter(has_text="Add").last.click(); pg.wait_for_timeout(400)
    pg.locator("aside button").filter(has_text="Collect").first.click(); pg.wait_for_timeout(800)
    pg.screenshot(path=f"{OUT}/13_topup.png")
    pg.get_by_role("button", name="20", exact=True).click(); pg.wait_for_timeout(200)
    pg.locator("[role=dialog] button").filter(has_text="Complete").last.click(); pg.wait_for_timeout(500)
    if pg.get_by_role("button", name="Place order").count(): pg.get_by_role("button", name="Place order").click()
    pg.wait_for_timeout(2200); pg.screenshot(path=f"{OUT}/14_edited.png")
    res = pg.evaluate("""() => { const k=Object.keys(localStorage).find(k=>k.endsWith('ten_lazeez')); const s=JSON.parse(localStorage.getItem(k)).slices;
      return {sales:s.sales.sales.slice(0,2).map(x=>({inv:x.invoiceNumber,total:x.totalH,status:x.status,code:x.cancelReasonCode,repl:x.replacesInvoice,by:x.replacedByInvoice,pay:x.payments.map(p=>p.method+':'+p.amountH)})),
              kitchen:s.kitchen.orders.slice(0,3).map(o=>o.orderNumber+':'+o.status)} }""")
    print(json.dumps(res))
    pg.get_by_role("button", name="Close").last.click(); pg.wait_for_timeout(500)

    # Cancel with reason
    newinv = res["sales"][0]["inv"]
    pg.goto(B + "/sales"); pg.wait_for_timeout(1500)
    pg.get_by_text(newinv).filter(visible=True).first.click(); pg.wait_for_timeout(1500)
    pg.get_by_role("button", name="Cancel order").click(); pg.wait_for_timeout(600)
    pg.locator("[role=dialog]").last.get_by_role("combobox").first.click(); pg.wait_for_timeout(300)
    pg.screenshot(path=f"{OUT}/15_reasons.png")
    pg.get_by_role("option").filter(has_text="Wrong").first.click(); pg.wait_for_timeout(200)
    pg.get_by_role("button", name="Yes, cancel order").click(); pg.wait_for_timeout(1500)
    pg.screenshot(path=f"{OUT}/16_cancelled.png")
    res = pg.evaluate("""() => { const k=Object.keys(localStorage).find(k=>k.endsWith('ten_lazeez')); const s=JSON.parse(localStorage.getItem(k)).slices;
      return {s:s.sales.sales.slice(0,1).map(x=>x.invoiceNumber+':'+x.status+':'+x.cancelReasonCode), k:s.kitchen.orders.slice(0,3).map(o=>o.orderNumber+':'+o.status)} }""")
    print(json.dumps(res))
    print("errors:", errs[:6])
    b.close()
