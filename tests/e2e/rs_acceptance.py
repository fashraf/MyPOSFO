"""Restaurant Opening & Closing — acceptance tests 1-10.

Runs against the dev server in mock mode with a simulated clock, so the
cross-midnight case is real: the browser believes it is 22:30 Riyadh on
20 November, the restaurant is opened, then time is moved past midnight.
"""
import json, re, sys
from playwright.sync_api import sync_playwright

B = "http://localhost:5173"; OUT = "/tmp/rs_acc"
RESULTS = []

def check(name, ok, detail=""):
    RESULTS.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))

SVC = "/src/services/restaurantSessionService.ts"

def svc(pg, body):
    """Run JS against the same service instance the app uses."""
    return pg.evaluate(f"""async () => {{
      for (let i = 0; i < 50 && !window.__pos; i++) await new Promise(r => setTimeout(r, 100));
      const P = window.__pos;
      const m = {{ restaurantSessionService: P.restaurantSessionService }};
      const sales = {{ salesService: P.salesService, salesSnapshot: P.salesSnapshot }};
      const ALL = P.ALL_PERMISSIONS;
      try {{ {body} }} catch (e) {{ return {{ error: e.code || String(e), message: e.message }}; }}
    }}""")

def money(text):
    t = text.replace("−", "-")
    m = re.search(r"[\d,]+\.\d{2}", t)
    if not m: return None
    v = round(float(m.group(0).replace(",", "")) * 100)
    return -v if "-" in t[:m.start()] else v

def login(pg, email):
    pg.goto(B + "/login"); pg.wait_for_timeout(900)
    pg.get_by_text(email, exact=True).first.click(); pg.wait_for_timeout(2200)

def sell(pg, item="Butter Croissant", method="cash"):
    pg.goto(B + "/pos"); pg.wait_for_timeout(1500)
    pg.get_by_role("button", name=item).first.click(); pg.wait_for_timeout(500)
    dlg = pg.locator("[role=dialog] button", has_text="Add")
    if dlg.count(): dlg.last.click(); pg.wait_for_timeout(300)
    pg.get_by_role("button", name="Charge").click(); pg.wait_for_timeout(800)
    if method == "card":
        pg.locator("[role=dialog]").get_by_role("button", name="Card", exact=True).first.click(); pg.wait_for_timeout(300)
    else:
        pg.get_by_role("button", name="Exact").click(); pg.wait_for_timeout(300)
    pg.locator("[role=dialog] button").filter(has_text="Complete").last.click(); pg.wait_for_timeout(600)
    pg.get_by_role("button", name="Place order").click(); pg.wait_for_timeout(2200)

def pick(pg, field_id, option, note=None):
    pg.locator(f"#{field_id}").click(); pg.wait_for_timeout(300)
    pg.get_by_role("option", name=option).first.click(); pg.wait_for_timeout(200)
    if note: pg.locator(f"#{field_id}-note").fill(note)

def close_via_ui(pg, delta_h=0, reason=None, shot=None):
    """reason = (option label, note)"""
    pg.goto(B + "/restaurant/close"); pg.wait_for_timeout(1800)
    expected = money(pg.get_by_test_id("close-expected").inner_text())
    counted = expected + delta_h
    pg.get_by_test_id("actual-cash").fill(f"{counted/100:.2f}"); pg.wait_for_timeout(300)
    if pg.get_by_test_id("card-matched").count(): pg.get_by_test_id("card-matched").check()
    if pg.locator("#close-pending-reason").count(): pick(pg, "close-pending-reason", "Kitchen will finish them")
    if reason: pick(pg, "close-diff-reason", reason[0], reason[1])
    if shot: pg.screenshot(path=f"{OUT}/{shot}.png")
    pg.get_by_test_id("close-submit").click(); pg.wait_for_timeout(500)
    return expected, counted

def confirm_close(pg):
    dialog_text = pg.get_by_test_id("close-confirm").locator("xpath=ancestor::*[@role='dialog'][1]").inner_text()
    disabled = pg.get_by_test_id("close-confirm-button").is_disabled()
    pg.get_by_test_id("close-confirm-tick").click(); pg.wait_for_timeout(200)
    pg.get_by_test_id("close-confirm-button").click(); pg.wait_for_timeout(2200)
    dialog_text += "|TICK_REQUIRED" if disabled else ""
    return dialog_text

def open_via_ui(pg, cash="500"):
    pg.goto(B + "/restaurant/open"); pg.wait_for_timeout(1500)
    if not pg.get_by_test_id("opening-cash").count():
        pg.screenshot(path=f"{OUT}/debug_open.png"); print("DEBUG open page:", pg.locator("main").inner_text()[:400])
    pg.get_by_test_id("opening-cash").fill(cash, timeout=5000)
    pg.get_by_test_id("open-submit").click(); pg.wait_for_timeout(500)
    text = pg.locator("[role=dialog]").last.inner_text()
    pg.get_by_role("button", name="Yes, open restaurant").click(); pg.wait_for_timeout(1800)
    return text

def current(pg):
    return svc(pg, "return await m.restaurantSessionService.current('brn_001');")

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    ctx.add_init_script("localStorage.setItem('app.language','en')")
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:300]))
    pg.clock.install(time="2026-11-20T22:30:00+03:00")
    pg.goto(B + "/login"); pg.wait_for_timeout(900)
    pg.evaluate("()=>{Object.keys(localStorage).filter(k=>k.startsWith('poscomplete.mockdb')).forEach(k=>localStorage.removeItem(k))}")
    pg.reload(); pg.wait_for_timeout(900)
    login(pg, "owner@alnoor.sa")

    # ---------- close the seeded day (balanced) ----------
    seeded = current(pg)
    expected, counted = close_via_ui(pg, 0)
    msg = confirm_close(pg)
    check("Close confirmation needs the confirm tick and shows the day in cards", "|TICK_REQUIRED" in msg and all(w in msg for w in ("Opening balance", "Total sales", "Cash", "Card", "Open for (h:mm)", "Last order", "What happens when the counter is closed")))
    check("Close confirmation shows the exact message",
          "Are you sure you want to close this business session? Once closed, no new orders can be created under this session. All closing figures will be saved as a permanent financial record." in msg)
    check("Balanced close lands on the closing report", "/restaurant/history/" in pg.url and pg.get_by_test_id("closed-success").count() == 1, pg.url)
    check("Balanced shows green 'Balanced'", pg.get_by_test_id("difference-pill").first.get_attribute("data-state") == "balanced")

    # ---------- Test 3: closed restaurant ----------
    pg.goto(B + "/pos"); pg.wait_for_timeout(1500)
    banner = pg.get_by_test_id("pos-closed-banner")
    check("T3 POS shows the CLOSED banner", banner.count() == 1 and "Restaurant is currently CLOSED. Please open the restaurant before accepting new orders." in banner.inner_text())
    check("T3 Owner sees the Open button on the till", pg.get_by_test_id("pos-open-restaurant").count() == 1)
    pg.screenshot(path=f"{OUT}/t3_pos_closed.png")
    rej = svc(pg, """
      const items = await window.__pos.catalogService.posItems();
      const it = items.find(i => i.nameEn === 'Butter Croissant');
      return await sales.salesService.commit({ branchId: 'brn_001', customerId: null, cashierName: 'x', tenderedH: null, discountH: 0,
        lines: [{ id: 'l1', itemId: it.id, nameAr: it.nameAr, nameEn: it.nameEn, kind: it.kind, quantity: 1, unitPriceH: it.priceH, unitCostH: 0, discountH: 0 }],
        payments: [{ method: 'card', amountH: 100000 }] });""")
    check("T3 Service rejects an order with RESTAURANT_CLOSED", rej.get("error") == "RESTAURANT_CLOSED" and "Open a business session before creating orders" in rej.get("message", ""), json.dumps(rej)[:160])

    # ---------- Test 1 + 2: open late, sell before and after midnight ----------
    msg = open_via_ui(pg, "500")
    check("Open confirmation shows the exact message",
          "Are you sure you want to open this restaurant for business? Once confirmed, the restaurant will be available to receive new orders." in msg)
    s1 = current(pg)
    check("T1 Session opened with SAR 500 for business date 2026-11-20", s1 and s1["openingBalanceH"] == 50000 and s1["businessDate"] == "2026-11-20", json.dumps(s1)[:120] if s1 else "none")
    pg.goto(B + "/restaurant"); pg.wait_for_timeout(1500)
    check("T1 Dashboard shows OPEN and the green indicator", "OPEN" in pg.get_by_test_id("restaurant-status").first.inner_text() and pg.get_by_test_id("open-indicator").count() == 1)
    check("T1 Actual closing reads 'Not Yet Recorded'", "Not Yet Recorded" in pg.get_by_test_id("actual-closing").inner_text())

    sell(pg, method="cash")                                   # 22:3x on 20 Nov
    pg.clock.fast_forward("01:50:00")                         # -> about 00:25 on 21 Nov
    sell(pg, method="card")
    sell(pg, method="cash")
    pg.goto(B + "/restaurant"); pg.wait_for_timeout(1500)
    alert = pg.get_by_test_id("alert-cross-midnight")
    check("T2 Cross-midnight alert is shown", alert.count() == 1 and "started on November 20 and is continuing into November 21" in alert.inner_text(), alert.inner_text() if alert.count() else "")
    check("T2 Business date stays November 20", "November 20" in pg.get_by_test_id("business-date").inner_text())
    pg.screenshot(path=f"{OUT}/t2_cross_midnight.png")
    after = svc(pg, f"""
      const s = await m.restaurantSessionService.current('brn_001');
      const sum = await m.restaurantSessionService.summary(s.id);
      const mine = sales.salesSnapshot().sales.filter(x => x.sessionId === s.id);
      return {{ id: s.id, open: s.status, bd: s.businessDate, n: mine.length, soldDays: mine.map(x => new Date(x.soldAt).toLocaleString('en-GB', {{ timeZone: 'Asia/Riyadh' }})), sum }};""")
    check("T2 All 3 orders stamped to the same session, two after midnight UTC+3",
          after["n"] == 3 and after["open"] == "open" and after["bd"] == "2026-11-20", json.dumps({k: after[k] for k in ("n", "soldDays", "bd")}))
    sm = after["sum"]
    cash_row = next(r for r in sm["byMethod"] if r["method"] == "cash"); card_row = next(r for r in sm["byMethod"] if r["method"] == "card")
    check("T1 Card sale not counted as cash", card_row["count"] == 1 and sm["cash"]["salesH"] == cash_row["amountH"] and cash_row["count"] == 2,
          f"cash {cash_row['amountH']} x{cash_row['count']}, card {card_row['amountH']} x{card_row['count']}")
    check("T1 Methods add up to total sales", sum(r["amountH"] for r in sm["byMethod"]) == sm["totalH"], f"{sum(r['amountH'] for r in sm['byMethod'])} vs {sm['totalH']}")

    # cash movement: SAR 10 expense
    pg.goto(B + "/restaurant/cash"); pg.wait_for_timeout(1500)
    pg.get_by_test_id("movement-type-expense").click()
    pg.get_by_test_id("movement-amount").fill("10"); pg.get_by_test_id("movement-description").fill("Ice")
    pg.get_by_test_id("movement-submit").click(); pg.wait_for_timeout(400)
    pg.get_by_role("button", name="Confirm").click(); pg.wait_for_timeout(1500)
    sm2 = svc(pg, "const s = await m.restaurantSessionService.current('brn_001'); return await m.restaurantSessionService.summary(s.id);")
    c = sm2["cash"]
    check("T1 Expected = opening + cash sales + additions − refunds − expenses − withdrawals",
          c["expectedH"] == c["openingH"] + c["salesH"] + c["additionsH"] - c["refundsH"] - c["expensesH"] - c["withdrawalsH"] - c["transfersH"] and c["expensesH"] == 1000,
          json.dumps(c))

    # ---------- Test 8: duplicate opening ----------
    pg.goto(B + "/restaurant/open"); pg.wait_for_timeout(1300)
    check("T8 Open page refuses while a session is open", pg.get_by_test_id("already-open").count() == 1)
    dup = svc(pg, "return await m.restaurantSessionService.open({ branchId: 'brn_001', openingBalanceH: 100 }, { id: 'u', name: 'Test', permissions: ALL });")
    check("T8 Service refuses a second open session", dup.get("error") == "SESSION_ALREADY_OPEN", dup.get("message", ""))

    # ---------- Test 7: pending orders ----------
    pend = sm2["pendingOrders"]
    nap = svc(pg, f"""const s = await m.restaurantSessionService.current('brn_001');
      return await m.restaurantSessionService.close({{ sessionId: s.id, actualClosingH: {sm2['cash']['expectedH']} }},
        {{ id: 'sup', name: 'No-approve closer', permissions: ['restaurant.session.close', 'restaurant.session.view'] }});""")
    check("T7 Open kitchen orders never block closing, but need a reason", pend > 0 and nap.get("error") == "OVERRIDE_REASON_REQUIRED", f"pending={pend} → {nap.get('error')}")

    # ---------- Test 4: shortage of SAR 50 ----------
    exp4, cnt4 = close_via_ui(pg, -5000, reason=None, shot="t4_shortage_counted")
    hint = pg.get_by_test_id("close-hint").inner_text()
    diff_text = pg.get_by_test_id("close-difference").inner_text()
    focused = pg.evaluate("document.activeElement && document.activeElement.id")
    check("T4 Shortage shows −SAR 50.00 in red, reason required and the field gets focus", money(diff_text) == -5000 and "reason" in hint.lower() and focused == "close-diff-reason", f"{diff_text} / {hint} / focus={focused}")
    pick(pg, "close-diff-reason", "Change given wrongly", "twice")
    pg.get_by_test_id("close-submit").click(); pg.wait_for_timeout(500)
    confirm_close(pg)
    s4 = svc(pg, "const h = await m.restaurantSessionService.history({ branchId: 'brn_001' }); return h[0];")
    check("T4 Saved: difference −5000, shortage, reason and override recorded",
          s4["differenceH"] == -5000 and s4["discrepancyReason"] == "Change given wrongly: twice" and (pend == 0 or s4.get("pendingOverride")), json.dumps({k: s4.get(k) for k in ("number", "differenceH", "pendingOverride")})[:200])
    check("T4 Report shows the shortage", pg.get_by_test_id("difference-pill").first.get_attribute("data-state") == "shortage")
    pg.screenshot(path=f"{OUT}/t4_report.png")
    t4_id = s4["id"]

    # Orders blocked again after close (concurrent commit after close)
    rej2 = svc(pg, "return await sales.salesService.commit({ branchId: 'brn_001', customerId: null, cashierName: 'x', tenderedH: null, discountH: 0, lines: [], payments: [] });")
    check("T9 After close, the till refuses orders at the service", rej2.get("error") == "RESTAURANT_CLOSED", rej2.get("error"))

    # ---------- Test 5: surplus of SAR 100 ----------
    open_via_ui(pg, "300")
    sell(pg, method="cash")
    close_via_ui(pg, 10000, reason=("Tip left in the drawer", None), shot="t5_surplus_counted")
    confirm_close(pg)
    s5 = svc(pg, "const h = await m.restaurantSessionService.history({ branchId: 'brn_001' }); return h[0];")
    check("T5 Surplus of +SAR 100 recorded in orange", s5["differenceH"] == 10000 and pg.get_by_test_id("difference-pill").first.get_attribute("data-state") == "surplus", str(s5["differenceH"]))

    # ---------- Test 9: concurrent closing ----------
    conc = svc(pg, """
      const s = await m.restaurantSessionService.open({ branchId: 'brn_001', openingBalanceH: 0 }, { id: 'u', name: 'Owner', permissions: ALL });
      const a = { id: 'a', name: 'Manager A', permissions: ALL }, b = { id: 'b', name: 'Manager B', permissions: ALL };
      const res = await Promise.allSettled([
        m.restaurantSessionService.close({ sessionId: s.id, actualClosingH: 0, pendingOverrideReason: 'x' }, a),
        m.restaurantSessionService.close({ sessionId: s.id, actualClosingH: 0, pendingOverrideReason: 'x' }, b),
      ]);
      return res.map(r => r.status === 'fulfilled' ? 'ok:' + r.value.closedBy : 'err:' + r.reason.code);""")
    check("T9 Two managers closing at once: exactly one succeeds", sorted(x[:3] for x in conc) == ["err", "ok:"] and any("SESSION_ALREADY_CLOSED" in x for x in conc), json.dumps(conc))

    # ---------- Test 10: historical reports ----------
    pg.goto(B + "/restaurant/history"); pg.wait_for_timeout(1800)
    days = pg.get_by_test_id("day-row").count()
    pg.get_by_role("tab", name="All sessions").click(); pg.wait_for_timeout(800)
    rows = pg.get_by_test_id("history-row").count()
    check("T10 History by day lists each business day", days >= 20, f"days={days}")
    pg.goto(B + f"/restaurant/history/{t4_id}"); pg.wait_for_timeout(1800)
    rep = pg.get_by_test_id("session-report").inner_text()
    check("T10 History lists sessions and the closed report reopens with its figures", rows > 20 and money(pg.get_by_test_id("report-difference").inner_text()) == -5000 and pg.get_by_test_id("print-report").count() == 1, f"rows={rows}")
    check("T10 Audit trail records open, cash movement and close", all(w in pg.get_by_test_id("audit-trail").inner_text() for w in ("Opened", "Cash movement", "Closed")))
    pg.screenshot(path=f"{OUT}/t10_report.png")

    # ---------- Test 6: unauthorized cashier ----------
    pg.goto(B + "/login"); pg.wait_for_timeout(600)
    ctx2 = b.new_context(viewport={"width": 1440, "height": 900}); ctx2.add_init_script("localStorage.setItem('app.language','en')")
    pg2 = ctx2.new_page(); pg2.on("pageerror", lambda e: errs.append(str(e)[:300]))
    pg2.goto(B + "/login"); pg2.wait_for_timeout(800)
    pg2.evaluate("()=>{Object.keys(localStorage).filter(k=>k.startsWith('poscomplete.mockdb')).forEach(k=>localStorage.removeItem(k))}"); pg2.reload(); pg2.wait_for_timeout(800)
    login(pg2, "cashier@alnoor.sa")
    pg2.goto(B + "/restaurant/open"); pg2.wait_for_timeout(1500)
    check("T6 Cashier sees a permission message on Open Restaurant", pg2.get_by_test_id("no-permission").count() == 1)
    pg2.screenshot(path=f"{OUT}/t6_cashier.png")
    cashier = svc(pg2, """const s = await m.restaurantSessionService.current('brn_001');
      const actor = { id: 'c', name: 'Cashier', permissions: ['pos.view','pos.create_sale','restaurant.session.view'] };
      const o = await m.restaurantSessionService.open({ branchId: 'brn_002', openingBalanceH: 0 }, actor).catch(e => e.code);
      const c = await m.restaurantSessionService.close({ sessionId: s.id, actualClosingH: 0 }, actor).catch(e => e.code);
      return { o, c };""")
    check("T6 Service refuses open and close for a cashier", cashier.get("o") == "FORBIDDEN" and cashier.get("c") == "FORBIDDEN", json.dumps(cashier))

    print("page errors:", errs[:5])
    b.close()

passed = sum(1 for _, ok, _ in RESULTS if ok)
print(f"\n{passed}/{len(RESULTS)} checks passed")
json.dump([{"name": n, "ok": o, "detail": d} for n, o, d in RESULTS], open(f"{OUT}/results.json", "w"), indent=1)
sys.exit(0 if passed == len(RESULTS) else 1)
