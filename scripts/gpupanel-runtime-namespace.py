#!/usr/bin/env python3
"""Read-only GPUPanel runtime namespace audit before any installer is created.

Current inherited 1Panel paths are architectural constraints. Do not claim
safe installation based on a successful source build or a changed service name.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]

# This explicit evidence matrix must be updated by a separately reviewed
# migration. A missing source/marker never automatically means the risk is gone.
RISKS = (
    ("core_ctl_entry", "core/cmd/server/cmd/root.go", "/usr/local/bin/1pctl",
     "Core CLI settings still read the inherited 1pctl base directory"),
    ("core_bootstrap_config", "core/init/viper/viper.go", "/opt/1panel/conf/app.yaml",
     "Core development configuration still reads the old global directory"),
    ("core_ctl_secrets", "core/init/viper/viper.go", 'ctl_conf.Load("ORIGINAL_PASSWORD")',
     "Core initial credentials are loaded from inherited ctl configuration"),
    ("core_database", "core/init/db/db.go", '"1panel/db/core.db"',
     "Core database still uses legacy 1panel namespace"),
    ("agent_master_socket", "agent/server/server.go", 'masterSocketDir          = "/etc/1panel"',
     "Master agent UNIX socket still shares inherited service directory"),
    ("agent_base_dir", "agent/init/viper/viper.go", "nodeInfo.BaseDir",
     "Agent base directory comes from the inherited node provider contract"),
    ("agent_database", "agent/init/dir/dir.go", '"1panel/db"',
     "Agent database still uses inherited directory"),
    ("agent_install_apps", "agent/init/dir/dir.go", '"1panel/apps"',
     "Agent AppInstall resources still use inherited installation paths"),
    ("agent_recycle_bin", "agent/init/dir/dir.go", '"/.1panel_clash"',
     "Agent recycle bin is a legacy global root path"),
)


def audit(root: Path) -> dict:
    issues = []
    for identifier, relative, signature, detail in RISKS:
        source = root / relative
        if source.is_symlink() or not source.is_file():
            state = "UNKNOWN"
            reason = "source file missing or symlinked; independent review required"
        else:
            try:
                content = source.read_text(encoding="utf-8")
            except OSError:
                content = ""
            if not content:
                state = "UNKNOWN"
                reason = "cannot inspect source"
            elif signature in content:
                state = "BLOCKED"
                reason = detail
            else:
                # Moving a literal to another helper is not proof of isolation.
                state = "UNKNOWN"
                reason = "previous signature absent; prove all callers migrated independently"
        issues.append({"id": identifier, "source": relative, "state": state, "reason": reason})
    return {
        "product": "GPUPanel",
        "phase": "runtime-namespace-architectural-gate",
        "installable": False,
        "readyForProduction": False,
        "mutationPerformed": False,
        "blocked": sum(x["state"] == "BLOCKED" for x in issues),
        "unknown": sum(x["state"] == "UNKNOWN" for x in issues),
        "issues": issues,
        "requiredProof": [
            "Isolate runtime paths and Core/Agent database ownership",
            "Implement separate GPUPanel bootstrap and agent socket",
            "Demonstrate side-by-side coexistence or explicitly refuse legacy installation",
            "Implement transactional backup, upgrade and rollback",
            "Verify clean Ubuntu 24.04 fresh install, first admin, Host and Docker end-to-end",
        ],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="GPUPanel inherited runtime path inventory (read only)")
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--human", action="store_true")
    parser.add_argument("--strict", action="store_true",
                        help="exit 2 until independently proven installation-safe")
    args = parser.parse_args(argv)
    report = audit(args.root)
    if args.human:
        print("GPUPanel runtime namespace | NOT YET INSTALLABLE")
        for issue in report["issues"]:
            print(f"[{issue['state']}] {issue['id']} ({issue['source']}) — {issue['reason']}")
        print(f"Unresolved: {report['blocked']} blocked, {report['unknown']} unknown")
    else:
        print(json.dumps(report, indent=2))
    return 2 if args.strict else 0


if __name__ == "__main__":
    raise SystemExit(main())
