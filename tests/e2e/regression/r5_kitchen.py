import sys
from playwright.sync_api import sync_playwright
B="http://localhost:5173"; OUT="/tmp/r5"; lang=sys.argv[1] if len(sys.argv)>1 else "en"
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":1440,"height":900}); ctx.add_init_script(f"localStorage.setItem('app.language','{lang}')")
    pg=ctx.new_page(); errs=[]
    pg.on("pageerror", lambda e: errs.append(str(e)[:300])); pg.on("console", lambda m: errs.append(m.text[:200]) if m.type=="error" else None)
    pg.goto(B+"/login"); pg.wait_for_timeout(900)
    pg.evaluate("()=>{Object.keys(localStorage).filter(k=>k.startsWith('poscomplete.mockdb')).forEach(k=>localStorage.removeItem(k))}"); pg.reload(); pg.wait_for_timeout(900)
    pg.get_by_text("owner@lazeez.sa", exact=True).first.click(); pg.wait_for_timeout(2200)
    pg.goto(B+"/kitchen"); pg.wait_for_timeout(1800); pg.screenshot(path=f"{OUT}/{lang}_1_active.png")
    st = lambda: pg.evaluate("()=>{const k=Object.keys(localStorage).find(k=>k.endsWith('ten_lazeez'));return JSON.parse(localStorage.getItem(k)).slices.kitchen.orders.filter(o=>o.orderNumber.startsWith('K')).map(o=>o.orderNumber+':'+o.status+':'+o.items.map(i=>i.completedQuantity).join(','))}")
    if lang=="en":
        # start #201 (one tap), then complete via dialog with confirm
        pg.locator("article").filter(has_text="#201").get_by_role("button", name="Start preparing").click(); pg.wait_for_timeout(700)
        print("after start", st())
        pg.locator("article").filter(has_text="#201").get_by_role("button", name="Mark completed").click(); pg.wait_for_timeout(600)
        pg.screenshot(path=f"{OUT}/2_confirm_complete.png")
        pg.get_by_role("button", name="Yes").click(); pg.wait_for_timeout(800)
        print("after complete", st())
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        # open #200, undo an item that is done
        pg.locator("article").filter(has_text="#200").locator("button").first.click(); pg.wait_for_timeout(600)
        pg.get_by_role("button", name="Not done").first.click(); pg.wait_for_timeout(300)
        pg.screenshot(path=f"{OUT}/3_item_undo.png")
        pg.get_by_role("button", name="Yes").click(); pg.wait_for_timeout(700)
        print("after item undo", st())
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        pg.get_by_role("tab").filter(has_text="Completed").click(); pg.wait_for_timeout(600); pg.screenshot(path=f"{OUT}/4_completed.png")
        pg.get_by_role("button", name="List").click(); pg.wait_for_timeout(500); pg.screenshot(path=f"{OUT}/5_list.png")
        pg.get_by_role("tab").filter(has_text="Cancelled").click(); pg.wait_for_timeout(500); pg.screenshot(path=f"{OUT}/5b_cancelled.png")
        pg.get_by_role("button", name="Analytics").click(); pg.wait_for_timeout(800); pg.screenshot(path=f"{OUT}/6_analytics.png")
        pg.keyboard.press("Escape")
        pg.goto(B+"/collection"); pg.wait_for_timeout(1500); pg.screenshot(path=f"{OUT}/7_collection.png")
        pg.get_by_role("button", name="Handed over").first.click(); pg.wait_for_timeout(500); pg.screenshot(path=f"{OUT}/8_confirm_hand.png")
        pg.get_by_role("button", name="Yes").click(); pg.wait_for_timeout(800)
        print("after handover", st())
        pg.get_by_role("tab").filter(has_text="Handed over").click(); pg.wait_for_timeout(500); pg.screenshot(path=f"{OUT}/9_done.png")
    else:
        pg.get_by_role("button", name="التحليلات").click(); pg.wait_for_timeout(800); pg.screenshot(path=f"{OUT}/ar_analytics.png")
        pg.keyboard.press("Escape"); pg.goto(B+"/collection"); pg.wait_for_timeout(1500); pg.screenshot(path=f"{OUT}/ar_collection.png")
    print("errors", errs[:5]); b.close()
