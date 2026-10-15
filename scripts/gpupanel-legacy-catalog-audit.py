#!/usr/bin/env python3
"""Read-only metadata audit for retired upstream 1Panel app catalog records.

This tool deliberately has NO purge/delete operation. Never publishes individual
application names or database row IDs in output.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sqlite3
import sys


class AuditError(Exception):
    pass


def inspect(path: Path) -> dict:
    if path.is_symlink() or not path.is_file():
        raise AuditError("SQLite database must be an existing regular file, not a symlink")
    try:
        # mode=ro prevents creation or mutations, even if invoked by an admin.
        connection = sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True, timeout=2)
    except sqlite3.Error as exc:
        raise AuditError("cannot open database read-only") from exc
    try:
        connection.execute("PRAGMA query_only=ON")
        tables = {row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        if not {"apps", "app_installs", "app_details"} <= tables:
            raise AuditError("unrecognized app database schema: expected apps, app_installs and app_details")
        required = {
            "apps": {"id", "resource"},
            "app_installs": {"id", "app_id"},
            "app_details": {"id", "app_id"},
        }
        for table, columns in required.items():
            actual = {row[1] for row in connection.execute(f"PRAGMA table_info({table})")}
            if not columns <= actual:
                raise AuditError(f"incomplete {table} table schema")
        query = lambda sql: int(connection.execute(sql).fetchone()[0])
        remote_total = query("SELECT COUNT(*) FROM apps WHERE resource='remote'")
        installed_refs = query("""SELECT COUNT(*) FROM app_installs i
                                  JOIN apps a ON i.app_id=a.id WHERE a.resource='remote'""")
        used_remote = query("""SELECT COUNT(DISTINCT a.id) FROM apps a
                                JOIN app_installs i ON i.app_id=a.id
                                WHERE a.resource='remote'""")
        no_install = query("""SELECT COUNT(*) FROM apps a WHERE a.resource='remote'
                               AND NOT EXISTS (SELECT 1 FROM app_installs i WHERE i.app_id=a.id)""")
        detail_rows = query("""SELECT COUNT(*) FROM app_details d
                                JOIN apps a ON d.app_id=a.id WHERE a.resource='remote'""")
        broken_references = query("""SELECT COUNT(*) FROM app_installs i
                                     LEFT JOIN apps a ON i.app_id=a.id WHERE a.id IS NULL""")
        return {
            "mode": "readonly-audit",
            "databaseFile": path.name,
            "legacyRemoteDefinitions": remote_total,
            "legacyRemoteDefinitionsWithInstallations": used_remote,
            "legacyInstallationRecords": installed_refs,
            "legacyRemoteDefinitionsWithoutInstallation": no_install,
            "legacyRemoteDetailRows": detail_rows,
            "orphanedInstallationReferences": broken_references,
            "candidateForAutomaticDeletion": False,
            "recordsModified": 0,
            "limitations": [
                "No backup/snapshot or external references were inspected",
                "Unreferenced definitions are NOT automatically safe to purge",
                "Running Compose/Docker workloads were NOT inspected",
            ],
        }
    except sqlite3.Error as exc:
        raise AuditError("database read failed or schema is incompatible") from exc
    finally:
        connection.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only GPUPanel legacy app Catalog audit")
    parser.add_argument("--database", required=True, type=Path,
                        help="Path to the operator-selected agent.db (never automatically searches)")
    args = parser.parse_args(argv)
    try:
        print(json.dumps(inspect(args.database), ensure_ascii=False, indent=2))
        return 0
    except AuditError as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
