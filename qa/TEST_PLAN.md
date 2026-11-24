# MyPOS test plan — suite v1.1.0

Results from: Suite v1.1.0 · staging · manual run · web dev · api — · 24 November 2026 11:48 (Riyadh)

## Front end (FO)

| ID | Severity | Test case | Steps | Expected | Result | Where to fix |
| --- | --- | --- | --- | --- | --- | --- |
| WEB-MAJ-01 | Major | Login screen opens within 15 s without script errors | Open /login on desktop. | Login screen with sign-in options; no script errors. | pass | FO · src/main.tsx, src/App.tsx (router), the failing chunk named in the browser console; check the web container logs. |
| WEB-MAJ-02 | Major | Owner signs in and the dashboard opens | Sign in as owner@lazeez.sa / Demo@1234. | Lands on /dashboard with the menu. | pass | FO · src/features/auth/pages/Login.tsx, src/features/auth/context/AuthContext.tsx · API mode: MyPosAPI Features/Access/AuthEndpoints.cs (/api/auth/login, /verify). |
| WEB-MAJ-03 | Major | Cashier sells an item for cash; the done screen shows a numeric order number and the change | PIN 1111 → Butter Croissant → Add → Charge → Exact → Complete → Place order. | Done screen with order #N (number) and invoice 100xxx. | pass | FO · src/pages/PosPage.tsx, src/features/pos/CheckoutModal.tsx (canComplete ~l.193), src/services/salesService.ts commit() ~l.181, src/features/pos/OrderComplete.tsx l.106 · API mode: POST /api/sales → DB sales.usp_CommitSale (20-sale-idempotency.sql). |
| WEB-MAJ-04 | Major | At 360×720 the Charge button is visible and nothing sits on top of it | Phone 360×720 → PIN 1111 → add an item → look at Charge. | Charge fully visible; tapping it opens checkout. | pass | FO · src/pages/PosPage.tsx phone bar (data-testid phone-charge ~l.742) and the bottom tab bar in src/components/layout (z-index / bottom padding). |
| WEB-MAJ-05 | Major | Typing 1.5abc as cash received is cleaned or rejected, and checkout stays blocked while cash is short | Charge → Cash → type 1.5abc in Amount received. | Field shows 1.5 (letters dropped); Complete disabled while short. | pass | FO · src/components/ui/PriceInput.tsx sanitise() l.11, src/features/pos/CheckoutModal.tsx canComplete ~l.193. |
| WEB-MAJ-06 | Major | A wrong staff PIN is refused and stays on the login screen | Login → Staff PIN → 9999. | “That PIN is not recognised.”; still on /login. | pass | FO · src/features/auth/components/PinPad.tsx, src/features/auth/services/mockAuthService.ts / apiAuthService.ts (PIN lookup). |
| WEB-MAJ-07 | Major | Cashier sells an item paid by card | PIN 1111 → Butter Croissant → Add → Charge → Card → Complete → Place order. | Done screen with order #N; no change due. | pass | FO · src/features/pos/CheckoutModal.tsx (mode 'card', buildResult ~l.200), src/services/salesService.ts commit(). |
| WEB-MIN-01 | Minor | No raw translation keys (like checkout.payment.title) on any page | Browse every menu page in English. | Only real words, no dotted keys. | pass | FO · add the missing key to src/i18n/locales/en.ts and ar.ts (the key is quoted in the result). |
| WEB-MIN-02 | Minor | No console errors while browsing every page | Browse every menu page with the console open. | No red errors. | pass | FO · the page and message quoted in the result. |
| WEB-MIN-03 | Minor | Login screen is usable within 5 s | Open /login on a fresh browser. | Usable in ≤ 5 s. | pass | FO · bundle size (vite build warnings), nginx gzip/cache in deploy/nginx.conf, server load. |
| WEB-MOD-01 | Moderate | Every page in the owner's menu opens without a crash or error screen | As owner, open every menu link. | Each page renders; no error screen. | pass | FO · the page file under src/pages/ for each listed route (routes in src/config/navigation.ts); stack trace in the console. |
| WEB-MOD-02 | Moderate | Main pages fit a 360 px wide phone without sideways scrolling | Phone 360×720 → dashboard, pos, sales, catalog, customers, kitchen, restaurant, settings. | No sideways scrolling. | pass | FO · the listed page: a wide table/grid without overflow-x-auto or a fixed min-width; check with dev tools at 360 px. |
| WEB-MOD-03 | Moderate | Arabic switches the app to right-to-left with Arabic text | Language العربية → dashboard. | dir=rtl and the text is Arabic. | pass | FO · src/i18n/I18nProvider.tsx (sets document dir ~l.91), missing keys in src/i18n/locales/ar.ts. |
| WEB-MOD-04 | Moderate | The sale just made appears in Sales | After WEB-MAJ-03 open /sales. | The new invoice number is listed. | pass | FO · src/pages/SalesPage.tsx, salesService.list() · API mode: GET /api/sales (MyPosAPI Features/Sales). |
| WEB-MOD-05 | Moderate | Signing out returns to the login screen | Header menu → Sign out. | Back on /login; going to /dashboard asks to sign in again. | pass | FO · src/components/layout/Header.tsx signOut ~l.55, src/features/auth/context/AuthContext.tsx. |

## API

| ID | Severity | Test case | Steps | Expected | Result | Where to fix |
| --- | --- | --- | --- | --- | --- | --- |
| API-MAJ-01 | Major | GET /health returns 200 JSON | curl http://SERVER/health | 200 {"status":"ok", …} | fail | API · container down or crashing: `docker compose logs api` on the server; MyPosAPI src/PosApi/Program.cs (startup, /health ~l.492); nginx route in MyPOSFO deploy/nginx.conf. |
| API-MAJ-02 | Major | GET /health/db returns 200 | curl http://SERVER/health/db | 200 {"status":"ok","database":"MyPosDB…"} | skip | API/DB · connection string in /opt/mypos/<env>/.env (DB_NAME, APP_DB_*), src/PosApi/Data/SqlConnectionFactory.cs, `docker compose ps db`. |
| API-MAJ-03 | Major | POST /api/auth/login answers with a normal response (no 5xx) | POST /api/auth/login {identifier, password} for an unknown user | 4xx (refused) — never 5xx | skip | API · src/PosApi/Features/Access/AuthEndpoints.cs RequestOtpAsync; DB auth tables (11-api-auth-tables.sql). |
| API-MIN-01 | Minor | Health answers in under 1 s | Time GET /health | < 1000 ms | skip | API/Ops · server load (`docker stats`), cold start after deploy. |
| API-MIN-02 | Minor | GET /health tells which version is running | Read version from GET /health | version = the deployed tag (sha-… or v…) | skip | API · src/PosApi/Program.cs /health (reads APP_VERSION, set by deploy/compose.yml). |
| API-MOD-01 | Moderate | Sales, catalog, tax settings and sessions refuse requests without a token (401) | GET each private endpoint with no token | 401 for all | skip | API · the endpoint's MapGroup in src/PosApi/Features/** is missing .RequireAuthorization(). |
| API-MOD-02 | Moderate | Malformed JSON gets a 400, not a 500 | POST /api/auth/login with broken JSON | 400 | skip | API · request validation / exception handler in src/PosApi/Program.cs. |

## Database (DB)

| ID | Severity | Test case | Steps | Expected | Result | Where to fix |
| --- | --- | --- | --- | --- | --- | --- |
| DB-MAJ-01 | Major | The migration journal has entries for this database | SELECT COUNT(*) FROM dbo.__Migrations | > 0 rows | not run | DB · deploy log of migrate.sh (Actions → Deploy API → Deploy step); MyPosAPI deploy/bin/migrate.sh; the failing file in db-migrations/. |
| DB-MAJ-02 | Major | Every invoice number is used once | GROUP BY InvoiceNumber HAVING COUNT(*) > 1 on sales.Sale | 0 rows | not run | DB · sales.usp_CommitSale numbering (db-migrations/20-sale-idempotency.sql) → move to the numeric counter (plan §C). |
| DB-MIN-01 | Minor | All check constraints are enabled and trusted | sys.check_constraints is_disabled / is_not_trusted | 0 | not run | DB · re-enable WITH CHECK in a new migration. |
| DB-MOD-01 | Moderate | Every sale has at least one line | sales.Sale without sales.SaleLine | 0 rows | not run | DB/API · sales.usp_CommitSale must insert lines in the same transaction; POST /api/sales payload. |
| DB-MOD-02 | Moderate | Every sale has a payment record | sales.Sale without sales.SalePayment | 0 rows | not run | DB/API · sales.usp_CommitSale payments insert; seed data in nazad-posmain-full.sql. |
| DB-MOD-03 | Moderate | All foreign keys are enabled and trusted | sys.foreign_keys is_disabled / is_not_trusted | 0 | not run | DB · a migration used NOCHECK; re-enable with ALTER TABLE … WITH CHECK CHECK CONSTRAINT in a new migration. |
| DB-MOD-04 | Moderate | A backup newer than 26 hours exists on the server | ls -t /opt/mypos/<env>/backups | newest .bak < 26 h old | not run | Ops · deploy/bin/backup.sh; the nightly backup timer (setup.sh) or run Actions → Deploy to create one. |

## Hourly health (Ops)

| ID | Severity | Test case | Steps | Expected | Result | Where to fix |
| --- | --- | --- | --- | --- | --- | --- |
| HLT-MAJ-01 | Major | Home page answers 200 | GET / | 200 HTML | not run | Ops · `docker compose ps` on the server; web container logs; Actions → Rollback if it started after a deploy. |
| HLT-MAJ-02 | Major | GET /health answers 200 | GET /health | 200 JSON | not run | Ops/API · `docker compose logs api`; Actions → Rollback. |
| HLT-MAJ-03 | Major | GET /health/db answers 200 | GET /health/db | 200 | not run | Ops/DB · `docker compose ps db`, disk full, SQL Server memory. |
| HLT-MIN-01 | Minor | Home page and API answer in under 2 s | time GET / and /health | < 2 s | not run | Ops · server load (`docker stats`, `uptime`). |
| HLT-MOD-01 | Moderate | More than 15 % disk free | df / | > 15 % free | not run | Ops · old images/backups: `docker image prune -a`, backups keep 14. |
| HLT-MOD-02 | Moderate | Newest backup < 26 h | ls -t backups | < 26 h | not run | Ops · deploy/bin/backup.sh / nightly timer. |

