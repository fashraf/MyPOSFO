"""Refund path, kitchen-started block, Arabic + phone wizard."""
import json
from playwright.sync_api import sync_playwright
B="http://localhost:5173"; OUT="/tmp/wiz"
def login(ctx, email):
    pg=ctx.new_page(); errs=[]
    pg.on("pageerror", lambda e: errs.append(str(e)[:300]))
    pg.on("console", lambda m: errs.append(m.text[:200]) if m.type=="error" else None)
    pg.goto(B+"/login"); pg.wait_for_timeout(900)
    if not pg.get_by_text(email, exact=True).first.is_visible(): pg.get_by_test_id("personas-toggle").click(); pg.wait_for_timeout(300)
    pg.get_by_text(email, exact=True).first.click(); pg.wait_for_timeout(2200)
    return pg, errs
def sell(pg, names):
    pg.goto(B+"/pos"); pg.wait_for_timeout(1800)
    for n in names:
        pg.get_by_role("button", name=n).first.click(); pg.wait_for_timeout(500)
        if pg.locator("[role=dialog]").count():
            d=pg.locator("[role=dialog]")
            btn=d.locator("button").filter(has_text="Add")
            btn.last.click(); pg.wait_for_timeout(400)
    pg.locator("aside button").filter(has_text="Charge").first.click(); pg.wait_for_timeout(700)
    pg.locator("[role=dialog] button").filter(has_text="Exact").first.click()
    pg.locator("[role=dialog] button").filter(has_text="Complete").last.click(); pg.wait_for_timeout(500)
    pg.get_by_role("button", name="Place order").click(); pg.wait_for_timeout(2200)
    inv=pg.evaluate("()=>{const k=Object.keys(localStorage).find(k=>k.endsWith('ten_lazeez'));return JSON.parse(localStorage.getItem(k)).slices.sales.sales[0].invoiceNumber}")
    pg.get_by_role("button", name="Close").last.click(); pg.wait_for_timeout(400)
    return inv
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":1440,"height":900})
    ctx.add_init_script("localStorage.setItem('app.language','en')")
    pg,errs=login(ctx,"owner@lazeez.sa")
    inv=sell(pg,["Classic Burger Meal","Onion Rings"]); print("sold",inv)
    pg.goto(B+"/sales"); pg.wait_for_timeout(1500); pg.get_by_text(inv).filter(visible=True).first.click(); pg.wait_for_timeout(1500)
    pg.get_by_role("button", name="Edit order").click(); pg.wait_for_timeout(2000)
    # remove onion rings: minus on its row
    row=pg.locator("main").get_by_text("Onion Rings").last
    pg.locator("aside").get_by_role("button", name="Remove line").first.click()
    pg.wait_for_timeout(400); pg.screenshot(path=f"{OUT}/20_refund_cart.png")
    pg.locator("aside button").filter(has_text="give back").first.click(); pg.wait_for_timeout(800)
    pg.screenshot(path=f"{OUT}/21_refund_confirm.png")
    print("dialog:", pg.locator("[role=dialog]").last.inner_text()[:300].replace("\n"," | "))
    pg.locator("[role=dialog]").last.locator("button").last.click(); pg.wait_for_timeout(2200)
    pg.screenshot(path=f"{OUT}/22_refund_done.png")
    print(pg.evaluate("()=>{const k=Object.keys(localStorage).find(k=>k.endsWith('ten_lazeez'));return JSON.parse(localStorage.getItem(k)).slices.sales.sales.slice(0,2).map(x=>[x.invoiceNumber,x.totalH,x.status,x.refundH,x.replacesInvoice])}"))
    # kitchen started block
    inv2=sell(pg,["Classic Burger Meal"]); print("sold",inv2)
    pg.goto(B+"/kitchen"); pg.wait_for_timeout(1800)
    ono=pg.evaluate("(inv)=>{const k=Object.keys(localStorage).find(k=>k.endsWith('ten_lazeez'));return JSON.parse(localStorage.getItem(k)).slices.sales.sales.find(x=>x.invoiceNumber===inv).orderNo}", inv2)
    short=f"#{ono}"; print("order no", ono)
    pg.locator("article").filter(has_text=short).get_by_role("button", name="Start preparing").click(); pg.wait_for_timeout(1200)
    pg.screenshot(path=f"{OUT}/23_kitchen.png")
    pg.goto(B+"/sales"); pg.wait_for_timeout(1500); pg.get_by_text(inv2).filter(visible=True).first.click(); pg.wait_for_timeout(1500)
    pg.screenshot(path=f"{OUT}/24_started_detail.png")
    print("edit visible after start:", pg.get_by_role("button", name="Edit order").count())
    print("errors", errs[:5])
    # Arabic + phone wizard
    ctx2=b.new_context(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True)
    ctx2.add_init_script("localStorage.setItem('app.language','ar')")
    pg2,errs2=login(ctx2,"owner@lazeez.sa")
    pg2.goto(B+"/catalog"); pg2.wait_for_timeout(1500); pg2.screenshot(path=f"{OUT}/29_ar_phone_catalog.png")
    pg2.get_by_role("button", name="إضافة منتج").first.click(timeout=5000) if pg2.get_by_role("button", name="إضافة منتج").count() else pg2.locator("main button").filter(has_text="منتج").first.click()
    pg2.wait_for_timeout(700); pg2.screenshot(path=f"{OUT}/30_ar_phone_type.png")
    d=pg2.locator("[role=dialog]"); d.locator("button").filter(has_text="وجبة كومبو").click()
    d.locator("button").filter(has_text="التالي").last.click(); pg2.wait_for_timeout(300)
    d.get_by_placeholder("Classic Burger Meal").fill("Test"); d.get_by_placeholder("0.00").first.fill("20")
    d.locator("button").filter(has_text="أضف أول صنف").click(); pg2.wait_for_timeout(600)
    pg2.screenshot(path=f"{OUT}/31_ar_phone_combo.png")
    ctx3=b.new_context(viewport={"width":1440,"height":900}); ctx3.add_init_script("localStorage.setItem('app.language','ar')")
    pg3,_=login(ctx3,"owner@lazeez.sa"); pg3.goto(B+"/catalog"); pg3.wait_for_timeout(1500)
    pg3.locator("main button").filter(has_text="إضافة منتج").first.click(); pg3.wait_for_timeout(600)
    d=pg3.locator("[role=dialog]"); d.locator("button").filter(has_text="منتج").first.click()
    d.locator("button").filter(has_text="التالي").last.click(); d.get_by_placeholder("Cappuccino").fill("Latte"); d.get_by_placeholder("0.00").first.fill("12")
    d.locator("button").filter(has_text="التالي").last.click(); d.locator("button").filter(has_text="إنشاء").click(); d.get_by_placeholder("50").fill("10")
    d.locator("button").filter(has_text="التالي").last.click(); pg3.wait_for_timeout(300); pg3.screenshot(path=f"{OUT}/32b_ar_recipe.png"); d.locator("button").filter(has_text="التالي").last.click(); pg3.wait_for_timeout(300); d.locator("button").filter(has_text="اختر واحدًا").first.click(); d.locator("button").filter(has_text="إضافة تفضيل").click(); pg3.wait_for_timeout(500)
    pg3.screenshot(path=f"{OUT}/32_ar_desktop_options.png")
    print("errors2", errs2[:5])
    b.close()
