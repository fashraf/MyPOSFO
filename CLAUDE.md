# MyPOSFO — rules for Claude

Front office (POS, POS Mobile, kitchen, back office screens). React 18 + TypeScript + Vite + Tailwind.
Backend lives in `fashraf/MyPosAPI`. Super admin (`MyPosSA`) comes later.

## How work flows
1. Fahad asks in plain words: a feature, a bug ID (e.g. `DASH-MAJ-02`) or a GitHub issue number.
2. Branch from `develop`: `feature/<short-name>` or `fix/<issue-id>-<short-name>`.
3. Bugs: write the **root cause** first (file, line, why), then the fix, then a test that would have caught it.
4. Keep mock mode and API mode in step: every service method changed in `src/services/*` gets its API path too
   (or a note in the PR that the API part is in a MyPosAPI PR, with its link).
5. Run before every push:
   - `npx tsc --noEmit -p tsconfig.app.json` (never `-p .` — it checks nothing)
   - `npm run build`
   - the relevant `tests/e2e/*.py` and `tests/e2e/regression/*.py` (dev server on :5173)
6. Commit with conventional messages (`feat:`, `fix:`, `chore:`), open a PR to `develop`, fill the PR template.
7. Merging to `develop` deploys to **staging**. Production only from a release tag on `main` after Fahad approves.
8. Never push to `main` or `develop` directly. Never commit secrets or `.env.local`.

## Deploy, rollback, QA (how it works)
- Merge to `develop` → `Deploy web` builds `ghcr.io/fashraf/mypos-web:sha-xxxxxxx`, deploys to staging over SSH, then `Sanity QA` runs.
- Sanity QA (`qa/`) checks database, API and front end (desktop + 360×720), writes the PDF report and opens/closes one
  GitHub issue per finding (`[WEB-MAJ-04] …`). When fixing, reference the ID; the next run closes the issue by itself.
- New checks: add to `qa/checks/*.py` with a new fixed ID; never reuse an ID.
- Server address lives only in the repo secrets `DEPLOY_HOST_STAGING` / `DEPLOY_HOST_PRODUCTION`. Rollback: Actions → Rollback.

## Conventions
- Every user-visible number is numeric: invoice (100001+), order no. (restarts at 1 per session),
  credit note (500001+), receipt (700001+), session, employee ID.
- Bilingual: every string goes in `src/i18n/locales/en.ts` and `ar.ts`; RTL must work.
- Layout: phones 360–430 px, tablets 768/1024/1180, desktop 1440. Check phone and desktop for UI changes.
- Mock DB: bump `MOCK_SCHEMA_VERSION` in `src/services/mock/db.ts` when seed shapes change.
- Tests use `window.__pos` for service access, never module imports.

## QA report format
Issues use IDs like `DASH-MAJ-01` (Major), `DASH-MOD-01` (Moderate), `DASH-MIN-01` (Minor).
When fixing, reply with: ID · root cause · fix · test added · where to verify on staging.
