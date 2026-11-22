"""Printing: default per document, receipt choice at checkout, preview, cloud queue, ESC/POS output."""
import json, sys
from playwright.sync_api import sync_playwright
B="http://localhost:5173"; OUT="/tmp/prn"; R=[]
def check(n, ok, d=""): R.append(ok); print(("PASS " if ok else "FAIL ")+n+(f" — {d}" if d else ""))
def pos(pg, js): return pg.evaluate("async () => { for (let i=0;i<50&&!window.__pos;i++) await new Promise(r=>setTimeout(r,100)); const P = window.__pos; " + js + " }")
def sell(pg, kind=None, shot=None):
    pg.goto(B+"/pos"); pg.wait_for_timeout(1500)
    pg.get_by_role("button", name="Butter Croissant").first.click(); pg.wait_for_timeout(500)
    d=pg.locator("[role=dialog] button", has_text="Add")
    if d.count(): d.last.click(); pg.wait_for_timeout(300)
    pg.get_by_role("button", name="Charge").click(); pg.wait_for_timeout(800)
    pg.get_by_role("button", name="Exact").click(); pg.wait_for_timeout(300)
    pg.locator("[role=dialog] button").filter(has_text="Complete").last.click(); pg.wait_for_timeout(700)
    if kind: pg.get_by_test_id(f"receipt-kind-{kind}").click(); pg.wait_for_timeout(300)
    if shot: pg.screenshot(path=f"{OUT}/{shot}.png")
    choice=pg.get_by_test_id("receipt-choice").inner_text()
    pg.get_by_role("button", name="Place order").click(); pg.wait_for_timeout(3000)
    return choice
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":1440,"height":900}); ctx.add_init_script("localStorage.setItem('app.language','en')")
    pg=ctx.new_page(); errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)[:300]))
    pg.goto(B+"/login"); pg.wait_for_timeout(900)
    pg.evaluate("()=>{Object.keys(localStorage).filter(k=>k.startsWith('poscomplete.mockdb')).forEach(k=>localStorage.removeItem(k))}"); pg.reload(); pg.wait_for_timeout(900)
    pg.get_by_text("owner@alnoor.sa", exact=True).first.click(); pg.wait_for_timeout(2200)

    choice = sell(pg, shot="1_checkout_choice")
    check("Checkout pre-selects the default receipt printer (starred)", "★ Screen preview" in choice, choice.replace("\n"," | "))
    pg.screenshot(path=f"{OUT}/2_done_preview.png")
    check("After the sale the receipt is printed on the default (preview) with a thumbnail", pg.get_by_test_id("print-ok").count()==1 and pg.get_by_test_id("print-thumb").count()==1, pg.get_by_test_id("print-status").inner_text().replace("\n"," "))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    # Printers tab: add a cloud printer as default for receipts
    pg.goto(B+"/settings?tab=printers"); pg.wait_for_timeout(1500)
    pg.screenshot(path=f"{OUT}/3_printers.png", full_page=True)
    pg.get_by_test_id("printer-add").click(); pg.wait_for_timeout(500)
    pg.get_by_test_id("conn-cloud").click()
    pg.get_by_test_id("printer-name").fill("Kitchen Star (cloud)")
    pg.get_by_test_id("make-default-receipt").click()
    pg.screenshot(path=f"{OUT}/4_add_cloud.png")
    pg.get_by_test_id("printer-save").click(); pg.wait_for_timeout(1000)
    dflt = pg.get_by_test_id("default-receipt").inner_text()
    check("New cloud printer becomes the receipt default (only one default)", "Kitchen Star (cloud)" in dflt, dflt.replace("\n"," "))
    cards = pg.get_by_test_id("printer-card").count()
    check("Printer list shows 3 printers", cards == 3, str(cards))

    choice = sell(pg)
    pg.wait_for_timeout(500)
    st = pg.get_by_test_id("print-status").inner_text()
    check("Sale goes to the cloud printer queue, small payload", "Sent to Kitchen Star (cloud)" in st, st.replace("\n"," "))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(3000)
    jobs = pos(pg, "return await P.printerService.jobs();")
    check("Cloud job printed after the printer polls", jobs and jobs[0]["status"]=="printed", json.dumps(jobs[:1])[:200])

    # No receipt
    choice = sell(pg, kind="none")
    check("Choosing 'None' prints nothing", "No receipt printed" in pg.get_by_test_id("print-status").inner_text())
    # Reprint elsewhere from the done screen: preview printer
    pg.get_by_test_id("print-again").click(); pg.wait_for_timeout(400)
    pg.get_by_test_id("receipt-choice").get_by_role("combobox").click(); pg.wait_for_timeout(300)
    pg.get_by_role("option").filter(has_text="Screen preview").first.click(); pg.wait_for_timeout(200)
    pg.get_by_test_id("print-again-go").click(); pg.wait_for_timeout(1500)
    check("Reprint on another printer from the done screen", pg.get_by_test_id("print-thumb").count()==1)
    pg.screenshot(path=f"{OUT}/5_reprint.png")

    # ESC/POS output checks (text and image)
    out = pos(pg, """
      const esc = await import('/src/lib/escpos.ts');
      const s = P.salesSnapshot().sales[0];
      const company = { nameAr: 'النور', nameEn: 'Al-Noor', vatNumber: '300000000000003' };
      const en = esc.buildReceiptModel({ sale: s, company, branchName: 'Olaya', language: 'en', kind: 'receipt' });
      const ar = esc.buildReceiptModel({ sale: s, company, branchName: 'العليا', language: 'ar', kind: 'receipt' });
      const t = await esc.renderReceipt(en, 58, 'auto');
      const i = await esc.renderReceipt(ar, 80, 'auto');
      const txt = new TextDecoder().decode(t.bytes);
      return { tMode: t.mode, tBytes: t.bytes.length, start: Array.from(t.bytes.slice(0,2)), hasTotal: txt.includes('TOTAL'), hasCut: txt.includes(String.fromCharCode(0x1d,0x56)), iMode: i.mode, iBytes: i.bytes.length, raster: Array.from(i.bytes.slice(2,5)) };""")
    check("English receipt auto-renders as ESC/POS text (~1–2 KB, init + cut)", out["tMode"]=="text" and out["start"]==[27,64] and out["hasTotal"] and out["hasCut"] and out["tBytes"]<3000, json.dumps(out))
    check("Arabic receipt auto-renders as a raster image (GS v 0)", out["iMode"]=="image" and out["raster"]==[29,118,48] and out["iBytes"]<80000, str(out["iBytes"]))
    # Dine-in: the bill prints when the order completes, not at payment
    pg.goto(B+"/pos"); pg.wait_for_timeout(1500)
    pg.get_by_role("button", name="Butter Croissant").first.click(); pg.wait_for_timeout(500)
    d=pg.locator("[role=dialog] button", has_text="Add")
    if d.count(): d.last.click(); pg.wait_for_timeout(300)
    pg.get_by_role("button", name="Charge").click(); pg.wait_for_timeout(800)
    pg.get_by_test_id("order-type-dine_in").click(); pg.wait_for_timeout(200)
    eff = pg.get_by_test_id("order-type-effect").inner_text()
    pg.get_by_role("button", name="Exact").click(); pg.wait_for_timeout(300)
    pg.locator("[role=dialog] button").filter(has_text="Complete").last.click(); pg.wait_for_timeout(700)
    note = pg.get_by_test_id("bill-later-note").count()
    kind_none = pg.get_by_test_id("receipt-kind-none").get_attribute("aria-pressed")
    pg.get_by_role("button", name="Place order").click(); pg.wait_for_timeout(2500)
    idle = pg.get_by_test_id("print-idle").inner_text() if pg.get_by_test_id("print-idle").count() else ""
    check("Dine-in checkout: card says bill when done, receipt defaults to None", "Bill when done" in eff and note == 1 and kind_none == "true", f"{eff} / note={note} / none={kind_none}")
    check("Dine-in done screen says the bill prints on completion", "prints when this order is completed" in idle, idle)
    pg.get_by_test_id("done-new-order").click(); pg.wait_for_timeout(400)
    done = pos(pg, """const s = P.salesSnapshot().sales[0]; const k = (await P.kitchenService.list()).find(o => o.orderNumber === s.invoiceNumber);
      await P.kitchenService.setStatus(k.id, 'completed'); return s.invoiceNumber;""")
    pg.wait_for_timeout(2500)
    shown = pg.get_by_test_id("print-preview").count()
    toast = pg.locator("body").inner_text()
    check("Completing the dine-in order prints its bill on the receipt default", f"Bill for {done} printed" in toast, f"preview={shown} toast={'Bill for' in toast}")
    print("page errors:", errs[:5]); b.close()
print(f"\n{sum(R)}/{len(R)} checks passed"); sys.exit(0 if all(R) else 1)
