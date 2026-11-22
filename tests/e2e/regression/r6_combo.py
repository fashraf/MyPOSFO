import re, json, sys
from playwright.sync_api import sync_playwright
B="http://localhost:5173"; OUT="/tmp/r6"; lang=sys.argv[1] if len(sys.argv)>1 else "en"
import os; os.makedirs(OUT, exist_ok=True)
def pick(pg, combo, text):
    combo.click(); pg.wait_for_timeout(250); pg.keyboard.type(text); pg.wait_for_timeout(250)
    pg.get_by_role("option").filter(has_text=re.compile("^"+re.escape(text))).first.click(); pg.wait_for_timeout(200)
def db(pg, js): return pg.evaluate("()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('poscomplete.mockdb')&&k.endsWith('ten_lazeez'));const s=JSON.parse(localStorage.getItem(k)).slices;return "+js+"}")
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":1440,"height":900}); ctx.add_init_script(f"localStorage.setItem('app.language','{lang}')")
    pg=ctx.new_page(); errs=[]
    pg.on("pageerror", lambda e: errs.append(str(e)[:300])); pg.on("console", lambda m: errs.append(m.text[:200]) if m.type=="error" else None)
    pg.goto(B+"/login"); pg.wait_for_timeout(900)
    pg.evaluate("()=>{Object.keys(localStorage).filter(k=>k.startsWith('poscomplete.mockdb')).forEach(k=>localStorage.removeItem(k))}"); pg.reload(); pg.wait_for_timeout(900)
    pg.get_by_text("owner@lazeez.sa", exact=True).first.click(); pg.wait_for_timeout(2200)
    pg.goto(B+"/catalog"); pg.wait_for_timeout(1500)
    pg.get_by_role("button", name="Add product").first.click(); pg.wait_for_timeout(700)
    wiz=pg.locator("[role=dialog]").first
    wiz.locator("button").filter(has_text="Combo meal").click()
    wiz.locator("button").filter(has_text="Next").last.click(); pg.wait_for_timeout(400)
    wiz.get_by_placeholder("Classic Burger Meal").fill("Super Smash Meal"); wiz.get_by_placeholder("0.00").first.fill("30")
    pg.screenshot(path=f"{OUT}/1_meal_empty.png")
    def part(chip, main, sizes=(), repl=(), extras=()):
        wiz.locator("button").filter(has_text=re.compile("Add (the first item|item)")).last.click(); pg.wait_for_timeout(500)
        m=pg.locator("[role=dialog]").last
        m.locator("button[aria-pressed]").filter(has_text=re.compile("^"+chip+"$")).first.click()
        pick(pg, m.get_by_role("combobox").filter(has_text="Choose an item").first, main)
        if sizes: m.get_by_test_id("part-step-sizes").click(); pg.wait_for_timeout(200)
        for key, price in sizes:
            full={"S":"Small","M":"Medium","L":"Large","XL":"Extra large"}[key]
            m.locator("button[aria-pressed]").filter(has_text=re.compile("^"+key+full+"$")).first.click(); pg.wait_for_timeout(150)
            if price: m.get_by_label(f"Extra cost for {key}").fill(price)
        if repl: m.get_by_test_id("part-step-replace").click(); pg.wait_for_timeout(200)
        for item, price in repl:
            pick(pg, m.get_by_role("combobox").filter(has_text="Add a replacement").first, item)
            if price: m.get_by_label("Extra price").last.fill(price)
        if extras: m.get_by_test_id("part-step-extras").click(); pg.wait_for_timeout(200)
        for ing, qty, price in extras:
            m.locator("button").filter(has_text="Add an extra").click(); pg.wait_for_timeout(150)
            pick(pg, m.get_by_role("combobox").filter(has_text="Choose an ingredient").first, ing)
            m.get_by_label("How much").last.fill(qty); m.get_by_label("Extra price").last.fill(price)
        m.get_by_test_id("part-step-review").click(); pg.wait_for_timeout(200)
        return m
    m=part("Burger","Double Smash", extras=[("Cheddar slice","1","2")])
    pg.screenshot(path=f"{OUT}/2_part_modal.png"); m.locator("button").filter(has_text="Add to meal").click(); pg.wait_for_timeout(400)
    m=part("Fries","Fries", sizes=[("M",""),("L","3"),("XL","5")])
    pg.screenshot(path=f"{OUT}/3_sizes.png"); m.locator("button").filter(has_text="Add to meal").click(); pg.wait_for_timeout(400)
    m=part("Drink","Coca-Cola", sizes=[("M",""),("L","2")], repl=[("Water 330","" ),("Vanilla Milkshake","6")])
    m.locator("button").filter(has_text="Add to meal").click(); pg.wait_for_timeout(400)
    pg.screenshot(path=f"{OUT}/4_nested.png")
    wiz.locator("button").filter(has_text="Next").last.click(); pg.wait_for_timeout(500)
    pg.screenshot(path=f"{OUT}/5_review.png")
    wiz.locator("button").filter(has_text="Save item").click(); pg.wait_for_timeout(1500)
    combo=db(pg,"s.catalog.items.find(i=>i.nameEn==='Super Smash Meal').combo")
    print(json.dumps(combo)[:900])
    # sell it
    pg.goto(B+"/pos"); pg.wait_for_timeout(1800)
    before=db(pg,"Object.fromEntries(s.ingredients.ingredients.filter(i=>['ing_fries','ing_cheese','ing_smash','ing_cup'].includes(i.id)).map(i=>[i.id,i.stock.brn_001]))")
    pg.get_by_role("button", name="Super Smash Meal").first.click(); pg.wait_for_timeout(600)
    d=pg.locator("[role=dialog]")
    pg.screenshot(path=f"{OUT}/6_till_sheet.png")
    d.locator("li").nth(1).locator("button").filter(has_text=re.compile("^L")).first.click()
    d.locator("li").nth(0).locator("button").filter(has_text="Extra cheese").first.click()
    pg.screenshot(path=f"{OUT}/7_till_chosen.png")
    print("button:", d.locator("button").filter(has_text="Add meal").inner_text())
    d.locator("button").filter(has_text="Add meal").click(); pg.wait_for_timeout(400)
    pg.locator("aside button").filter(has_text="Charge").first.click(); pg.wait_for_timeout(700)
    pg.locator("[role=dialog] button").filter(has_text="Exact").first.click()
    pg.locator("[role=dialog] button").filter(has_text="Complete").last.click(); pg.wait_for_timeout(500)
    pg.get_by_role("button", name="Place order").click(); pg.wait_for_timeout(2500)
    after=db(pg,"Object.fromEntries(s.ingredients.ingredients.filter(i=>['ing_fries','ing_cheese','ing_smash','ing_cup'].includes(i.id)).map(i=>[i.id,i.stock.brn_001]))")
    print("delta", {k: round(after[k]-before[k],2) for k in before})
    print("sale", db(pg,"(x=>({total:x.totalH,comps:x.lines[0].components.map(c=>c.nameEn+':'+c.priceDeltaH+':'+(c.modifiers||[]).map(m=>m.nameEn).join('+'))}))(s.sales.sales[0])"))
    print("kitchen", db(pg,"s.kitchen.orders.slice(-1)[0].items.map(i=>i.baseEn+' '+(i.mods||[]).map(m=>m.en).join(','))"))
    print("errors", errs[:5]); b.close()
