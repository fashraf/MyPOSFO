"""Database sanity, read-only, run on the server through SSH (QA_SSH) inside the SQL Server container."""
from __future__ import annotations
import os, subprocess
from pathlib import Path
from .common import Check, Result

C = {c.id: c for c in [
    Check("DB-MAJ-01", "Major", "Database", "Database migrations are missing", "The migration journal has entries for this database"),
    Check("DB-MAJ-02", "Major", "Database", "Invoice numbers are duplicated", "Every invoice number is used once"),
    Check("DB-MOD-01", "Moderate", "Database", "Sales exist without any lines", "Every sale has at least one line"),
    Check("DB-MOD-02", "Moderate", "Database", "Sales exist without a payment", "Every sale has a payment record"),
    Check("DB-MOD-03", "Moderate", "Database", "Foreign keys are disabled or untrusted", "All foreign keys are enabled and trusted"),
    Check("DB-MIN-01", "Minor", "Database", "Check constraints are disabled or untrusted", "All check constraints are enabled and trusted"),
]}

REMOTE = (
    "cd /opt/mypos/{env} && pw=$(grep ^DB_SA_PASSWORD= .env | cut -d= -f2-) && db=$(grep ^DB_NAME= .env | cut -d= -f2-) && "
    "docker compose --env-file .env exec -T db bash -c 'cat > /tmp/qa.sql' && "
    "docker compose --env-file .env exec -T db /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P \"$pw\" -d \"$db\" -h -1 -W -b -i /tmp/qa.sql"
)


def run(env: str = "staging") -> list[Result]:
    ssh = os.environ.get("QA_SSH")
    if not ssh:
        return [Result(c, "skip", "Skipped: no server access configured for this run (QA_SSH).") for c in C.values()]
    sql = (Path(__file__).parent.parent / "sql" / "db-sanity.sql").read_bytes()
    p = subprocess.run(ssh.split() + [REMOTE.format(env=env)], input=sql, capture_output=True, timeout=180)
    rows = {}
    for line in p.stdout.decode("utf-8", "replace").splitlines():
        parts = line.strip().split("|", 2)
        if len(parts) == 3 and parts[0] in C:
            rows[parts[0]] = parts
    out = []
    for cid, c in C.items():
        if cid in rows:
            out.append(Result(c, "pass" if rows[cid][1] == "pass" else "fail", rows[cid][2]))
        else:
            err = (p.stderr.decode("utf-8", "replace").strip().splitlines() or ["no output"])[-1][:160]
            out.append(Result(c, "fail" if cid == "DB-MAJ-01" else "skip", f"Could not run database checks: {err}"))
    return out
