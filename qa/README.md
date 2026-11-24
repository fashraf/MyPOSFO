# Sanity QA

Runs after every staging deploy (and on demand: Actions → **Sanity QA** → Run workflow). It checks the database, the API and the front end on desktop and on a 360×720 handheld, then:

1. writes `MyPOS_Staging_Sanity_Report_<date>.pdf` (same layout as the manual issue reports: counts, one issue per page with a screenshot, then every check run),
2. opens one GitHub issue per problem (`[WEB-MAJ-04] Charge button is covered…`), comments if it is still failing, and **closes it automatically** once a later run passes.

Run locally against any address:

```
pip install -r qa/requirements.txt && python -m playwright install chromium
python qa/run_sanity.py --base http://localhost:5173 --out qa-out --only frontend
```

Add a check: give it a new fixed ID in `checks/<area>.py` (never reuse an ID), a severity, the problem title, and what it verifies.
