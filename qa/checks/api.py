"""API sanity, black-box over HTTP through the same address users reach (nginx forwards /api and /health)."""
from __future__ import annotations
import json, time, urllib.request, urllib.error
from .common import Check, Result

C = {c.id: c for c in [
    Check("API-MAJ-01", "Major", "API", "The API does not answer",
          "GET /health returns 200 JSON", "curl http://SERVER/health", "200 {\"status\":\"ok\", …}",
          "API · container down or crashing: `docker compose logs api` on the server; MyPosAPI src/PosApi/Program.cs (startup, /health ~l.492); nginx route in MyPOSFO deploy/nginx.conf."),
    Check("API-MAJ-02", "Major", "API", "The API cannot reach the database",
          "GET /health/db returns 200", "curl http://SERVER/health/db", "200 {\"status\":\"ok\",\"database\":\"MyPosDB…\"}",
          "API/DB · connection string in /opt/mypos/<env>/.env (DB_NAME, APP_DB_*), src/PosApi/Data/SqlConnectionFactory.cs, `docker compose ps db`."),
    Check("API-MAJ-03", "Major", "API", "Sign-in endpoint fails with a server error",
          "POST /api/auth/login answers with a normal response (no 5xx)", "POST /api/auth/login {identifier, password} for an unknown user",
          "4xx (refused) — never 5xx",
          "API · src/PosApi/Features/Access/AuthEndpoints.cs RequestOtpAsync; DB auth tables (11-api-auth-tables.sql)."),
    Check("API-MAJ-04", "Major", "API", "Signing in with a one-time code fails",
          "A QA owner signs in end to end: code requested, code verified, /me returns the same user",
          "Register qa-owner@mypos.test once → POST /api/auth/login → POST /api/auth/verify (staging test code) → GET /api/auth/me",
          "200 with tokens; /me shows qa-owner@mypos.test",
          "API · src/PosApi/Features/Access/AuthEndpoints.cs, AuthStore.cs, Auth/OtpService.cs; staging must run with Auth__UseFixedDevOtp=true (deploy/windows/lib.ps1)."),
    Check("API-MOD-01", "Moderate", "API", "Private data is reachable without signing in",
          "Sales, catalog, tax settings and sessions refuse requests without a token (401)", "GET each private endpoint with no token",
          "401 for all",
          "API · the endpoint's MapGroup in src/PosApi/Features/** is missing .RequireAuthorization()."),
    Check("API-MOD-02", "Moderate", "API", "Bad input causes a server error",
          "Malformed JSON gets a 400, not a 500", "POST /api/auth/login with broken JSON", "400",
          "API · request validation / exception handler in src/PosApi/Program.cs."),
    Check("API-MIN-01", "Minor", "API", "API responses are slow",
          "Health answers in under 1 s", "Time GET /health", "< 1000 ms",
          "API/Ops · server load (`docker stats`), cold start after deploy."),
    Check("API-MIN-02", "Minor", "API", "The API does not report its version",
          "GET /health tells which version is running", "Read version from GET /health", "version = the deployed tag (sha-… or v…)",
          "API · src/PosApi/Program.cs /health (reads APP_VERSION, set by deploy/compose.yml)."),
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


QA_EMAIL = "qa-owner@mypos.test"


def sign_in(base: str) -> Result:
    import os
    c = C["API-MAJ-04"]
    if os.environ.get("QA_ENV") == "production":
        return Result(c, "skip", "Not run on production (it would create a QA business).")
    code = os.environ.get("QA_OTP_CODE", "1234")
    j = lambda d: json.dumps(d).encode()  # noqa: E731
    h = {"Content-Type": "application/json"}
    call(base, "/api/auth/register", "POST", j({"business": {"nameAr": "اختبار الجودة", "nameEn": "QA Business", "city": "Riyadh"},
                                                "owner": {"firstName": "QA", "lastName": "Owner", "email": QA_EMAIL},
                                                "tax": {"isVatRegistered": False}}), h)   # 200 first time, 422 email_taken after
    st, _, body, _ = call(base, "/api/auth/login", "POST", j({"identifier": QA_EMAIL}), h)
    try:
        challenge = json.loads(body)["challengeId"]
    except (ValueError, KeyError):
        return Result(c, "fail", f"Requesting a code returned {st}: {body[:120]}")
    st, _, body, _ = call(base, "/api/auth/verify", "POST", j({"challengeId": challenge, "code": code}), h)
    if st != 200:
        return Result(c, "fail", f"Verifying the code returned {st}: {body[:120]} (is Auth__UseFixedDevOtp on for staging?)")
    token = json.loads(body).get("accessToken", "")
    st, _, body, _ = call(base, "/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    if st == 200 and QA_EMAIL in body:
        return Result(c, "pass", f"Signed in as {QA_EMAIL}; /me answered 200.")
    return Result(c, "fail", f"Signed in, but /me returned {st}: {body[:120]}")


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
    try:
        version = json.loads(body).get("version") or ""
    except ValueError:
        version = ""
    out[-1].extra["version"] = version
    add("API-MIN-02", "pass" if version and version != "dev" else "fail",
        f"API reports version {version}." if version else "GET /health does not include a version.")

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

    out.append(sign_in(base))

    st, _, body, _ = call(base, "/api/auth/login", "POST", b"{not json", {"Content-Type": "application/json"})
    add("API-MOD-02", "fail" if st >= 500 else "pass", f"Malformed JSON returned {st}.")
    return out
