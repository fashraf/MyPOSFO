"""Regular health check (every hour, production by default). Read-only and fast: no sign-in, no sales."""
from __future__ import annotations
import os, subprocess
from .common import Check, Result
from .api import call

C = {c.id: c for c in [
    Check("HLT-MAJ-01", "Major", "Health", "The site is down", "Home page answers 200", "GET /", "200 HTML",
          "Ops · `docker compose ps` on the server; web container logs; Actions → Rollback if it started after a deploy."),
    Check("HLT-MAJ-02", "Major", "Health", "The API is down", "GET /health answers 200", "GET /health", "200 JSON",
          "Ops/API · `docker compose logs api`; Actions → Rollback."),
    Check("HLT-MAJ-03", "Major", "Health", "The database is unreachable", "GET /health/db answers 200", "GET /health/db", "200",
          "Ops/DB · `docker compose ps db`, disk full, SQL Server memory."),
    Check("HLT-MOD-01", "Moderate", "Health", "Server disk is almost full", "More than 15 % disk free", "df /", "> 15 % free",
          "Ops · old images/backups: `docker image prune -a`, backups keep 14."),
    Check("HLT-MOD-02", "Moderate", "Health", "No recent database backup", "Newest backup < 26 h", "ls -t backups", "< 26 h",
          "Ops · deploy/bin/backup.sh / nightly timer."),
    Check("HLT-MIN-01", "Minor", "Health", "The site is slow", "Home page and API answer in under 2 s", "time GET / and /health", "< 2 s",
          "Ops · server load (`docker stats`, `uptime`)."),
]}


def run(base: str, env: str) -> list[Result]:
    base = base.rstrip("/"); out = []
    add = lambda cid, st, d: out.append(Result(C[cid], st, d))  # noqa: E731
    st, ct, _, t1 = call(base, "/")
    add("HLT-MAJ-01", "pass" if st == 200 else "fail", f"GET / returned {st or 'no answer'} in {t1 * 1000:.0f} ms.")
    st, ct, body, t2 = call(base, "/health")
    add("HLT-MAJ-02", "pass" if st == 200 and "json" in ct else "fail", f"GET /health returned {st or 'no answer'}: {body[:80].strip()}")
    st, _, body, _ = call(base, "/health/db")
    add("HLT-MAJ-03", "pass" if st == 200 else "fail", f"GET /health/db returned {st or 'no answer'}.")
    add("HLT-MIN-01", "pass" if max(t1, t2) < 2 else "fail", f"Slowest answer {max(t1, t2) * 1000:.0f} ms.")
    ssh = os.environ.get("QA_SSH")
    if not ssh:
        add("HLT-MOD-01", "skip", "Skipped: no server access (QA_SSH)."); add("HLT-MOD-02", "skip", "Skipped: no server access (QA_SSH).")
        return out
    if os.environ.get("QA_TARGET") == "windows":
        folder = {"production": "POSprod", "staging": "POSStageing"}.get(env, "POSprod")
        cmd = ("$d = Get-PSDrive C; [int](100 * $d.Free / ($d.Used + $d.Free)); "
               f"$f = Get-ChildItem C:\\Project\\POS\\{folder}\\backups -Filter *.dump -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1; "
               "if ($f) { [int]((Get-Date) - $f.LastWriteTime).TotalHours } else { 'none' }")
    else:
        cmd = (f"df -P / | awk 'NR==2{{print 100-$5}}'; f=$(ls -1t /opt/mypos/{env}/backups/*.bak 2>/dev/null | head -1); "
               "[ -n \"$f\" ] && echo $(( ($(date +%s) - $(stat -c %Y \"$f\")) / 3600 )) || echo none")
    lines = subprocess.run(ssh.split() + [cmd], capture_output=True, text=True, timeout=60).stdout.split()
    free = lines[0].rstrip("%") if lines else ""
    add("HLT-MOD-01", "pass" if free.isdigit() and int(free) > 15 else "fail", f"{free or '?'} % disk free.")
    age = lines[1] if len(lines) > 1 else "none"
    add("HLT-MOD-02", "pass" if age.isdigit() and int(age) < 26 else "fail",
        f"Newest backup is {age} h old." if age.isdigit() else "No backup file found.")
    return out
