import re, json
from playwright.sync_api import sync_playwright
B="http://localhost:5173"; OUT="/tmp/r4"
import os; os.makedirs(OUT, exist_ok=True)
def pick(pg, combo, text):
    combo.click(); pg.wait_for_timeout(250); pg.keyboard.type(text); pg.wait_for_timeout(250)
    pg.get_by_role("option").filter(has_text=re.compile("^"+re.escape(text))).first.click(); pg.wait_for_timeout(200)
def nxt(pg): pg.locator("[role=dialog] button").filter(has_text="Next").last.click(); pg.wait_for_timeout(400)
def ing(pg, js): return pg.evaluate("()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('poscomplete.mockdb')&&k.endsWith('ten_lazeez'));const s=JSON.parse(localStorage.getItem(k)).slices;return "+js+"}")
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":1440,"height":900}); ctx.add_init_script("localStorage.setItem('app.language','en')")
    pg=ctx.new_page(); errs=[]
    pg.on("pageerror", lambda e: errs.append(str(e)[:300])); pg.on("console", lambda m: errs.append(m.text[:200]) if m.type=="error" else None)
    pg.goto(B+"/login"); pg.wait_for_timeout(900)
    pg.evaluate("()=>{Object.keys(localStorage).filter(k=>k.startsWith('poscomplete.mockdb')).forEach(k=>localStorage.removeItem(k))}"); pg.reload(); pg.wait_for_timeout(900)
    pg.get_by_text("owner@lazeez.sa", exact=True).first.click(); pg.wait_for_timeout(2200)
    # edit existing burger -> options step
    pg.goto(B+"/catalog?q=Classic Beef Burger"); pg.wait_for_timeout(1500)
    pg.locator("main table tbody tr").first.click(); pg.wait_for_timeout(1000)
    dlg=pg.locator("[role=dialog]")
    for _ in range(3): nxt(pg)
    pg.screenshot(path=f"{OUT}/1_edit_recipe.png")
    pg.screenshot(path=f"{OUT}/2_edit_options.png", full_page=False)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    # new product with recipe + options
    pg.get_by_role("button", name="Add product").first.click(); pg.wait_for_timeout(700)
    dlg.locator("button").filter(has_text="Product").first.click(); nxt(pg)
    dlg.get_by_placeholder("Cappuccino").fill("Chicken Wrap"); dlg.get_by_placeholder("0.00").first.fill("16"); nxt(pg)
    dlg.locator("button").filter(has_text="Generate").click(); dlg.get_by_placeholder("50").fill("0") if False else None
    dlg.get_by_role("switch").first.click(); pg.wait_for_timeout(200)  # stop counting stock for a made-to-order item
    nxt(pg)
    for name in ["Crispy chicken fillet","Lettuce","Tomato","Lazeez sauce"]:
        dlg.locator("button").filter(has_text="Add ingredient").last.click(); pg.wait_for_timeout(200)
        pick(pg, dlg.get_by_role("combobox").last, name)
    qty = dlg.locator("input[type=number]")
    qty.nth(1).fill("20"); qty.nth(2).fill("25"); qty.nth(3).fill("20")
    pg.screenshot(path=f"{OUT}/3_recipe.png"); nxt(pg)
    dlg.locator("button").filter(has_text="Remove").first.click(); pg.wait_for_timeout(300)
    dlg.locator("button").filter(has_text="No tomato").click(); dlg.locator("button").filter(has_text="No lazeez sauce").click()
    dlg.locator("button").filter(has_text="Extras").first.click(); pg.wait_for_timeout(300)
    dlg.locator("button").filter(has_text="Add ingredient").last.click(); pg.wait_for_timeout(200)
    pick(pg, dlg.get_by_role("combobox").last, "Cheddar slice")
    dlg.locator("input[inputmode=decimal], input[placeholder='0.00']").last.fill("2")
    pg.screenshot(path=f"{OUT}/4_options.png"); nxt(pg)
    pg.screenshot(path=f"{OUT}/5_review.png")
    dlg.locator("button").filter(has_text="Save item").click(); pg.wait_for_timeout(1500)
    print("saved:", dlg.count()==0)
    w = ing(pg, "s.catalog.items.find(i=>i.nameEn==='Chicken Wrap')")
    print(json.dumps({"recipe": w["recipe"], "groups": w["modifierGroups"]}, ensure_ascii=False)[:1200])
    print("errors", errs[:5]); b.close()
