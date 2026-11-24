"""Database sanity, read-only, run on the server through SSH (QA_SSH) inside the SQL Server container."""
from __future__ import annotations
import os, subprocess
from pathlib import Path
from .common import Check, Result

C = {c.id: c for c in [
    Check("DB-MAJ-01", "Major", "Database", "Database migrations are missing", "The migration journal has entries for this database",
          "SELECT COUNT(*) FROM dbo.__Migrations", "> 0 rows",
          "DB · deploy log of migrate.sh (Actions → Deploy API → Deploy step); MyPosAPI deploy/bin/migrate.sh; the failing file in db-migrations/."),
    Check("DB-MAJ-02", "Major", "Database", "Invoice numbers are duplicated", "Every invoice number is used once",
          "GROUP BY InvoiceNumber HAVING COUNT(*) > 1 on sales.Sale", "0 rows",
          "DB · sales.usp_CommitSale numbering (db-migrations/20-sale-idempotency.sql) → move to the numeric counter (plan §C)."),
    Check("DB-MOD-01", "Moderate", "Database", "Sales exist without any lines", "Every sale has at least one line",
          "sales.Sale without sales.SaleLine", "0 rows", "DB/API · sales.usp_CommitSale must insert lines in the same transaction; POST /api/sales payload."),
    Check("DB-MOD-02", "Moderate", "Database", "Sales exist without a payment", "Every sale has a payment record",
          "sales.Sale without sales.SalePayment", "0 rows", "DB/API · sales.usp_CommitSale payments insert; seed data in nazad-posmain-full.sql."),
    Check("DB-MOD-03", "Moderate", "Database", "Foreign keys are disabled or untrusted", "All foreign keys are enabled and trusted",
          "sys.foreign_keys is_disabled / is_not_trusted", "0", "DB · a migration used NOCHECK; re-enable with ALTER TABLE … WITH CHECK CHECK CONSTRAINT in a new migration."),
    Check("DB-MOD-04", "Moderate", "Database", "No recent database backup", "A backup newer than 26 hours exists on the server",
          "ls -t /opt/mypos/<env>/backups", "newest .bak < 26 h old",
          "Ops · deploy/bin/backup.sh; the nightly backup timer (setup.sh) or run Actions → Deploy to create one."),
    Check("DB-MIN-01", "Minor", "Database", "Check constraints are disabled or untrusted", "All check constraints are enabled and trusted",
          "sys.check_constraints is_disabled / is_not_trusted", "0", "DB · re-enable WITH CHECK in a new migration."),
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
    age = subprocess.run(ssh.split() + [f"f=$(ls -1t /opt/mypos/{env}/backups/*.bak 2>/dev/null | head -1); [ -n \"$f\" ] && echo $(( ($(date +%s) - $(stat -c %Y \"$f\")) / 3600 )) || echo none"],
                         capture_output=True, text=True, timeout=60).stdout.strip()
    if age.isdigit():
        rows["DB-MOD-04"] = ["DB-MOD-04", "pass" if int(age) < 26 else "fail", f"Newest backup is {age} h old."]
    elif age == "none":
        rows["DB-MOD-04"] = ["DB-MOD-04", "fail", "No backup file on the server yet."]
    out = []
    for cid, c in C.items():
        if cid in rows:
            out.append(Result(c, "pass" if rows[cid][1] == "pass" else "fail", rows[cid][2]))
        else:
            err = (p.stderr.decode("utf-8", "replace").strip().splitlines() or ["no output"])[-1][:160]
            out.append(Result(c, "fail" if cid == "DB-MAJ-01" else "skip", f"Could not run database checks: {err}"))
    return out
