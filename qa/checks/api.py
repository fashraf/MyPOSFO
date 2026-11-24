"""API sanity, black-box over HTTP through the same address users reach (nginx forwards /api and /health)."""
from __future__ import annotations
import json, time, urllib.request, urllib.error
from .common import Check, Result

C = {c.id: c for c in [
    Check("API-MAJ-01", "Major", "API", "The API does not answer",
          "GET /health returns 200 JSON"),
    Check("API-MAJ-02", "Major", "API", "The API cannot reach the database",
          "GET /health/db returns 200"),
    Check("API-MAJ-03", "Major", "API", "Sign-in endpoint fails with a server error",
          "POST /api/auth/login answers with a normal response (no 5xx)"),
    Check("API-MOD-01", "Moderate", "API", "Private data is reachable without signing in",
          "Sales, catalog, tax settings and sessions refuse requests without a token (401)"),
    Check("API-MOD-02", "Moderate", "API", "Bad input causes a server error",
          "Malformed JSON gets a 400, not a 500"),
    Check("API-MIN-01", "Minor", "API", "API responses are slow",
          "Health answers in under 1 s"),
]}
PROTECTED = ["/api/sales", "/api/catalog/items", "/api/settings/tax", "/api/restaurant-sessions/status"]


def call(base, path, method="GET", body: bytes | None = None, headers=None):
    req = urllib.request.Request(base + path, data=body, method=method, headers={"Accept": "application/json", **(headers or {})})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, r.headers.get("Content-Type", ""), r.read(4000).decode("utf-8", "replace"), time.time() - t0
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Content-Type", ""), e.read(2000).decode("utf-8", "replace"), time.time() - t0
    except Exception as e:  # noqa: BLE001
        return 0, "", f"{type(e).__name__}: {e}", time.time() - t0


def run(base: str) -> list[Result]:
    base = base.rstrip("/")
    out: list[Result] = []
    add = lambda cid, st, d="": out.append(Result(C[cid], st, d))  # noqa: E731

    st, ct, body, secs = call(base, "/health")
    if st == 200 and "json" in ct:
        add("API-MAJ-01", "pass", f"/health OK ({body[:80].strip()}).")
    else:
        why = "returned the web page instead of the API (is the API container running?)" if "html" in ct else f"returned {st or 'no answer'} {body[:100]}"
        add("API-MAJ-01", "fail", f"GET {base}/health {why}.")
        for cid in C:
            if cid != "API-MAJ-01":
                add(cid, "skip", "Skipped: the API is not reachable.")
        return out
    add("API-MIN-01", "pass" if secs < 1 else "fail", f"/health answered in {secs * 1000:.0f} ms.")

    st, ct, body, _ = call(base, "/health/db")
    add("API-MAJ-02", "pass" if st == 200 else "fail", f"/health/db returned {st}: {body[:120].strip()}")

    payload = json.dumps({"identifier": "qa-nobody@example.invalid", "password": "x"}).encode()
    st, ct, body, _ = call(base, "/api/auth/login", "POST", payload, {"Content-Type": "application/json"})
    add("API-MAJ-03", "fail" if st >= 500 or st == 0 else "pass",
        f"Sign-in with an unknown user returned {st}" + (f": {body[:120]}" if st >= 500 else " (handled normally)."))

    open_ones = []
    for path in PROTECTED:
        st, _, _, _ = call(base, path)
        if st not in (401, 403):
            open_ones.append(f"{path} → {st}")
    add("API-MOD-01", "fail" if open_ones else "pass",
        ("Without signing in, these answered instead of refusing: " + ", ".join(open_ones) + ".") if open_ones else f"All {len(PROTECTED)} private endpoints refuse anonymous requests.")

    st, _, body, _ = call(base, "/api/auth/login", "POST", b"{not json", {"Content-Type": "application/json"})
    add("API-MOD-02", "fail" if st >= 500 else "pass", f"Malformed JSON returned {st}.")
    return out
