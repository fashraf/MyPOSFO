"""Settings & Tax + kitchen routing: end-to-end checks in the browser."""
import json, sys
from playwright.sync_api import sync_playwright

B = "http://localhost:5173"; OUT = "/tmp/tax"
RESULTS = []
def check(name, ok, detail=""):
    RESULTS.append((name, bool(ok))); print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))

def pos(pg, js):
    return pg.evaluate("""async () => { for (let i=0;i<50&&!window.__pos;i++) await new Promise(r=>setTimeout(r,100)); const P = window.__pos; """ + js + " }")

def newest(pg):
    return pos(pg, "const s = P.salesSnapshot().sales[0]; const k = (await P.kitchenService.list()).filter(o => o.orderNumber === s.invoiceNumber); return { inv: s.invoiceNumber, totalH: s.totalH, taxH: s.taxH, subtotalH: s.subtotalH, tax: s.tax, orderType: s.orderType, tickets: k.map(o => o.status), lines: s.lines.map(l => l.unitPriceH * l.quantity) };")

def sell(pg, order_type=None, shot=None):
    pg.goto(B + "/pos"); pg.wait_for_timeout(1500)
    pg.get_by_role("button", name="Butter Croissant").first.click(); pg.wait_for_timeout(500)
    dlg = pg.locator("[role=dialog] button", has_text="Add")
    if dlg.count(): dlg.last.click(); pg.wait_for_timeout(300)
    if shot: pg.screenshot(path=f"{OUT}/{shot}.png")
    cart_text = pg.locator("main").inner_text()
    pg.get_by_role("button", name="Charge").click(); pg.wait_for_timeout(800)
    if order_type: pg.get_by_test_id(f"order-type-{order_type}").click(); pg.wait_for_timeout(200)
    cart_text += " " + (pg.get_by_test_id("order-type-cards").inner_text() if pg.get_by_test_id("order-type-cards").count() else "")
    pg.get_by_role("button", name="Exact").click(); pg.wait_for_timeout(300)
    pg.locator("[role=dialog] button").filter(has_text="Complete").last.click(); pg.wait_for_timeout(600)
    pg.get_by_role("button", name="Place order").click(); pg.wait_for_timeout(2200)
    done_text = pg.locator("body").inner_text()
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    return cart_text, done_text

def save_tax(pg, shot):
    pg.get_by_test_id("tax-save").click(); pg.wait_for_timeout(500)
    text = pg.locator("[role=dialog]").last.inner_text()
    pg.screenshot(path=f"{OUT}/{shot}.png")
    pg.get_by_role("button", name="Yes, apply to new orders").click(); pg.wait_for_timeout(1200)
    return text

with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1440, "height": 900})
    ctx.add_init_script("localStorage.setItem('app.language','en')")
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:300]))
    pg.goto(B + "/login"); pg.wait_for_timeout(900)
    pg.evaluate("()=>{Object.keys(localStorage).filter(k=>k.startsWith('poscomplete.mockdb')).forEach(k=>localStorage.removeItem(k))}"); pg.reload(); pg.wait_for_timeout(900)
    pg.get_by_text("owner@alnoor.sa", exact=True).first.click(); pg.wait_for_timeout(2200)

    # Default: KSA VAT 15% inclusive
    cart, _ = sell(pg, shot="1_cart_ksa")
    s = newest(pg)
    check("KSA: inclusive 15% — total equals menu price, VAT extracted", s["totalH"] == sum(s["lines"]) and s["taxH"] == round(s["totalH"] * 15 / 115) and s["tax"]["lines"][0]["label"] == "VAT 15%", json.dumps({k: s[k] for k in ("totalH", "taxH")}))
    check("Sidebar says 'Settings & Tax'", "Settings & Tax" in pg.locator("aside").first.inner_text())

    # Turn tax off
    pg.goto(B + "/settings?tab=tax"); pg.wait_for_timeout(1500)
    pg.screenshot(path=f"{OUT}/2_tax_ksa.png", full_page=True)
    pg.get_by_test_id("tax-master").click(); pg.wait_for_timeout(300)
    text = save_tax(pg, "3_confirm_off")
    check("Turning tax off explains what will happen", "No tax will be charged on any new order" in text and "past invoices and reports do not change" in text)
    cart, _ = sell(pg, shot="4_cart_off")
    s = newest(pg)
    check("Tax off: no tax charged, cart says so", s["taxH"] == 0 and s["totalH"] == sum(s["lines"]) and not s["tax"]["enabled"] and "Tax is turned off" in cart, str(s["taxH"]))

    # India GST, exclusive, CGST+SGST
    pg.goto(B + "/settings?tab=tax"); pg.wait_for_timeout(1500)
    pg.get_by_test_id("tax-master").click(); pg.wait_for_timeout(200)
    pg.get_by_role("combobox", name="Country / tax system").click(); pg.wait_for_timeout(300)
    pg.get_by_text("India — GST (CGST + SGST / IGST)").last.click(); pg.wait_for_timeout(400)
    preview = pg.get_by_test_id("tax-preview").inner_text()
    pg.screenshot(path=f"{OUT}/5_tax_india.png", full_page=True)
    check("India preset: preview shows CGST 2.5% + SGST 2.5% added on top", "CGST 2.5%" in preview and "SGST 2.5%" in preview and pg.get_by_test_id("gst-panel").count() == 1)
    text = save_tax(pg, "6_confirm_india")
    check("India confirm lists the price impact", "will cost the customer" in text and "Tax will be added on top" in text)
    cart, _ = sell(pg, shot="7_cart_india")
    s = newest(pg)
    base = sum(s["lines"]); gst = round(base * 5 / 100)
    labels = [l["label"] for l in s["tax"]["lines"]]
    check("India: exclusive 5% GST added, split CGST/SGST, parts add up",
          s["totalH"] == base + gst and s["taxH"] == gst and labels == ["CGST 2.5%", "SGST 2.5%"] and sum(l["taxH"] for l in s["tax"]["lines"]) == gst and "CGST 2.5%" in cart,
          json.dumps({"base": base, "total": s["totalH"], "lines": s["tax"]["lines"]}))

    # IGST for inter-state
    r = pos(pg, "const t = await P.taxService.get(); t.gstSupply = 'inter'; await P.taxService.update(t, 'test'); return true;")
    sell(pg)
    s = newest(pg)
    check("India inter-state: single IGST 5%", [l["label"] for l in s["tax"]["lines"]] == ["IGST 5%"], json.dumps(s["tax"]["lines"]))

    # Back to KSA via preset
    pos(pg, "const t = await P.taxService.get(); return true;")
    pg.goto(B + "/settings?tab=tax"); pg.wait_for_timeout(1500)
    pg.get_by_role("combobox", name="Country / tax system").click(); pg.wait_for_timeout(300)
    pg.get_by_text("Saudi Arabia — VAT 15%").last.click(); pg.wait_for_timeout(300)
    save_tax(pg, "8_confirm_ksa")

    # Routing: delivery -> don't send, takeaway -> straight to collection
    pg.goto(B + "/settings?tab=orders"); pg.wait_for_timeout(1500)
    pg.get_by_test_id("route-delivery-none").click()
    pg.get_by_test_id("route-takeaway-collection").click()
    pg.get_by_test_id("routing-drive_thru").get_by_role("switch").click()
    pg.screenshot(path=f"{OUT}/9_routing.png", full_page=True)
    pg.get_by_test_id("settings-save").click(); pg.wait_for_timeout(500)
    text = pg.locator("[role=dialog]").last.inner_text()
    pg.screenshot(path=f"{OUT}/10_confirm_routing.png")
    check("Routing confirm says what each change does", "Delivery orders will not be sent to the kitchen at all" in text and "Takeaway orders will skip the kitchen" in text and "Drive-thru" in text, text[:200])
    pg.get_by_role("button", name="Save changes").last.click(); pg.wait_for_timeout(1200)

    cart, done = sell(pg, "delivery", shot="11_pos_delivery")
    s = newest(pg)
    check("Delivery order: no kitchen ticket, cashier told why", s["orderType"] == "delivery" and s["tickets"] == [] and "this order type skips it" in done, json.dumps(s["tickets"]))
    check("Checkout shows where a delivery order goes", "Not sent to the kitchen" in cart, cart[-120:])
    cart, done = sell(pg, "takeaway")
    s = newest(pg)
    check("Takeaway order: straight to collection as ready", s["tickets"] == ["ready"] and "Sent straight to Collection" in done, json.dumps(s["tickets"]))
    cart, done = sell(pg, "dine_in")
    s = newest(pg)
    check("Dine-in order: goes to the kitchen", s["tickets"] == ["open"], json.dumps(s["tickets"]))
    check("Drive-thru now offered at the till", "Drive-thru" in cart)

    # Arabic smoke
    pg.evaluate("localStorage.setItem('app.language','ar')"); pg.goto(B + "/settings?tab=tax"); pg.wait_for_timeout(1500)
    pg.screenshot(path=f"{OUT}/12_ar_tax.png", full_page=True)
    print("page errors:", errs[:5]); b.close()

passed = sum(ok for _, ok in RESULTS); print(f"\n{passed}/{len(RESULTS)} checks passed"); sys.exit(0 if passed == len(RESULTS) else 1)
