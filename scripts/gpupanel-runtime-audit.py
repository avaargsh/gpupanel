#!/usr/bin/env python3
"""Read-only GPUPanel runtime collision audit for the standalone installer gate.

This is SOURCE inspection, not proof of actual runtime isolation. Fail closed
when expected files/anchors change so a future release cannot silently bypass
known 1Panel data paths, the control CLI, and the agent master socket.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
# Detection deliberately covers the concrete startup/read/write paths checked on
# 2026-10-15. It is not a complete whole-repository migration scanner.
REQUIRED = {
    "core/cmd/server/cmd/root.go": [
        ('ctl_binary', '"/usr/local/bin/1pctl"'),
        ('control_db', '"1panel/db"'),
    ],
    "core/init/viper/viper.go": [
        ('config_directory', '"/opt/1panel/conf/app.yaml"'),
        ('control_variables', 'ctl_conf.Load("BASE_DIR")'),
    ],
    "core/init/db/db.go": [
        ('core_db', '"1panel/db/core.db"'),
        ('agent_db', '"1panel/db/agent.db"'),
    ],
    "agent/server/server.go": [
        ('master_socket', 'masterSocketDir          = "/etc/1panel"'),
    ],
    "agent/init/dir/dir.go": [
        ('agent_data_directory', '"1panel/db"'),
        ('agent_application_directory', '"1panel/apps"'),
    ],
    "agent/init/viper/viper.go": [
        ('agent_dev_config', '"/opt/1panel/conf/app.yaml"'),
    ],
}
GATE_NAMES = frozenset(name for checks in REQUIRED.values() for name, _ in checks)


class AuditError(Exception):
    pass


def inspect(root: Path) -> dict:
    if root.is_symlink() or not root.is_dir():
        raise AuditError("source root must be a real directory")
    findings = []
    missing = []
    for rel, checks in REQUIRED.items():
        src = root / rel
        if src.is_symlink() or not src.is_file() or not src.resolve().is_relative_to(root.resolve()):
            missing.append(rel)
            continue
        try:
            rows = src.read_text(encoding="utf-8").splitlines()
        except OSError as exc:
            raise AuditError("cannot read source file " + rel) from exc
        for label, marker in checks:
            line = next((i for i, value in enumerate(rows, 1) if marker in value), None)
            if line is not None:
                findings.append({"code": label, "file": rel, "line": line, "state": "BLOCKED"})
            else:
                # A missing anchor is not a release pass; code could be moved
                # or renamed. It demands independent review/VM evidence.
                missing.append(rel + ":" + label)
    return {
        "product": "GPUPanel",
        "audit": "static-startup-namespace-check",
        "standaloneInstallAllowed": False,
        "status": "BLOCKED" if findings else "REVIEW_REQUIRED",
        "legacyAnchorsDetected": len(findings),
        "requiredChecks": len(GATE_NAMES),
        "findings": findings,
        "unresolvedChecks": missing,
        "independentRuntimeVerification": False,
        "limitations": [
            "Only enumerated Go startup paths checked; runtime dependencies outside these paths may remain",
            "Missing static anchors do not prove renamed code is isolated",
            "No systemd, socket, database, first-login or rollback test has been performed",
        ],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="GPUPanel read-only runtime namespace audit")
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args(argv)
    try:
        result = inspect(args.root)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        # Intentionally refuses to issue installer authorization. This cannot
        # succeed until reviewed replacement startup paths and real VM tests.
        return 2
    except (AuditError, OSError, ValueError) as exc:
        print(json.dumps({"status": "ERROR", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
