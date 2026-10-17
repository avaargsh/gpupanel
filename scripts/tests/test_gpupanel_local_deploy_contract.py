"""Source-level and unprivileged CLI guards; never install host services."""
from pathlib import Path
import json
import os
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
INSTALLER = ROOT / "deploy/install.sh"


class LocalDeployContract(unittest.TestCase):
    def test_preflight_precedes_host_mutation_and_private_log_never_retains_password(self):
        src = INSTALLER.read_text(encoding="utf-8")
        start = src.index("\ninit_install_log\nbanner")
        self.assertLess(src.index('python3 "$PREFLIGHT" --json'), start)
        self.assertLess(src.index("\nPY_INSTALL_APPROVAL\n"), start)
        self.assertIn('--approve-disposable-vm-install)', src)
        self.assertNotIn('PREFLIGHT_JSON="$(python3 "$PREFLIGHT" --json', src[start:])
        self.assertLess(src.index('assert_kv_safe PASSWORD'), start)
        self.assertLess(start, src.index('mkdir -p "$PANEL_DIR" "$CONF_DIR"'))
        self.assertNotIn("pkill", "\n".join(line for line in src.splitlines() if not line.startswith("#")))
        self.assertIn('LOG_FILE="$PANEL_DIR/log/install.log"', src)
        self.assertIn('chmod 0600 "$LOG_FILE"', src)
        self.assertIn('umask 077', src)
        self.assertNotIn('log "  password     : $PASSWORD"', src)
        self.assertIn('install -m 0700 "$PCTL_SRC"', src)

    @staticmethod
    def _preflight_report():
        return {
            "product": "GPUPanel",
            "phase": "pre-install-diagnostics-only",
            "installable": False,
            "safe_to_install": False,
            "blockers": [],
            "checks": [
                {"code": "operating_system", "state": "PASS", "detail": "Ubuntu 24.04"},
                {"code": "runtime_collision", "state": "PASS", "detail": "No known paths"},
                {"code": "runtime_path_symlink", "state": "PASS", "detail": "No redirects"},
                {"code": "disk_space", "state": "PASS", "detail": "5368709120"},
                # Metadata-only ancillary checks may be UNKNOWN on a
                # disposable fixture and do not grant service readiness.
                {"code": "docker", "state": "UNKNOWN", "detail": "Not verified"},
                {"code": "service_manager", "state": "UNKNOWN", "detail": "Not verified"},
            ],
        }

    def _authorize(self, report, approved="1"):
        src = INSTALLER.read_text(encoding="utf-8")
        code = src.split("<<'PY_INSTALL_APPROVAL' || die", 1)[1].split("\n", 1)[1].split("\nPY_INSTALL_APPROVAL\n", 1)[0]
        env = os.environ.copy()
        env["GPUPANEL_PREFLIGHT_JSON"] = json.dumps(report)
        # Exercise precisely the code executed by bash, not a reimplementation.
        return subprocess.run([sys.executable, "-", approved], input=code, env=env,
                              text=True, capture_output=True, check=False)

    def test_clean_metadata_report_is_not_permission_to_install(self):
        result = self._authorize(self._preflight_report(), approved="0")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--approve-disposable-vm-install", result.stderr)
        self.assertEqual(self._authorize(self._preflight_report(), approved="1").returncode, 0)

    def test_blockers_unknowns_and_malformed_reports_cannot_use_approval(self):
        good = self._preflight_report()
        cases = []
        for code in ("operating_system", "runtime_collision", "runtime_path_symlink", "disk_space"):
            import copy
            unknown = copy.deepcopy(good)
            next(c for c in unknown["checks"] if c["code"] == code)["state"] = "UNKNOWN"
            cases.append((code + " unknown", unknown))
            blocked = copy.deepcopy(good)
            next(c for c in blocked["checks"] if c["code"] == code)["state"] = "BLOCKED"
            cases.append((code + " blocked but blockers empty", blocked))
        missing = self._preflight_report()
        missing["checks"] = [x for x in missing["checks"] if x["code"] != "disk_space"]
        cases.append(("missing disk", missing))
        mismatch = self._preflight_report()
        mismatch["installable"] = True
        cases.append(("false installer authority", mismatch))
        badproduct = self._preflight_report()
        badproduct["product"] = "Other"
        cases.append(("wrong product", badproduct))
        duplicate = self._preflight_report()
        duplicate["checks"].append(dict(duplicate["checks"][0]))
        cases.append(("duplicate check", duplicate))
        unsupported = self._preflight_report()
        unsupported["checks"][0]["detail"] = "Ubuntu 26.04 experimental install explicitly selected"
        cases.append(("unsupported OS", unsupported))
        positive_blocker = self._preflight_report()
        positive_blocker["blockers"] = ["running_panel_process"]
        cases.append(("active panel", positive_blocker))
        for name, report in cases:
            with self.subTest(case=name):
                outcome = self._authorize(report)
                self.assertNotEqual(outcome.returncode, 0, outcome.stdout + outcome.stderr)
                self.assertIn("denied", outcome.stderr)

    def test_install_script_bash_syntax(self):
        result = subprocess.run(["bash", "-n", str(INSTALLER)],
                                capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_help_and_invalid_options_never_create_or_chmod_an_install_log(self):
        # Execute only early, unprivileged parsing paths in an isolated copy.
        with tempfile.TemporaryDirectory() as td:
            script = Path(td) / "install.sh"
            script.write_bytes(INSTALLER.read_bytes())
            stale_log = Path(td) / "install.log"
            stale_log.write_text("previous log must not be touched", encoding="utf-8")
            stale_log.chmod(0o644)
            for args, expected_status in ((["--help"], 0), (["--unknown-option"], 1)):
                with self.subTest(args=args):
                    result = subprocess.run(["bash", str(script), *args],
                                            capture_output=True, text=True, check=False)
                    self.assertEqual(result.returncode, expected_status)
                    self.assertEqual(stale_log.read_text(encoding="utf-8"), "previous log must not be touched")
                    self.assertEqual(stale_log.stat().st_mode & 0o777, 0o644)
                    self.assertEqual(sorted(p.name for p in Path(td).iterdir()), ["install.log", "install.sh"])

    def test_invalid_password_is_never_echoed_into_errors(self):
        # Evaluate only the exact installer validator, without root, preflight,
        # package installation, or any host mutation.
        src = INSTALLER.read_text(encoding="utf-8")
        definition = "assert_kv_safe() {" + src.split("assert_kv_safe() {", 1)[1].split("\nassert_kv_safe BASE_DIR", 1)[0]
        snippet = 'die() { printf "%s\\n" "$*" >&2; return 43; }\n' + definition + '\nassert_kv_safe PASSWORD "$1"\n'
        for secret in ("SENSITIVE password", 'SENSITIVE"pass', "SENSITIVE\\pass"):
            with self.subTest(secret_kind="spaces" if " " in secret else "metacharacter"):
                result = subprocess.run(["bash", "-c", snippet, "--", secret],
                                        capture_output=True, text=True, check=False)
                self.assertEqual(result.returncode, 43)
                self.assertIn("PASSWORD", result.stderr)
                self.assertNotIn("SENSITIVE", result.stdout + result.stderr)
                self.assertNotIn(secret, result.stdout + result.stderr)
        self.assertNotIn("invalid entrance '$ENTRANCE'", src)

    def test_package_preserves_attribution_and_ships_collision_checker(self):
        src = (ROOT / 'deploy/build.sh').read_text(encoding="utf-8")
        self.assertIn('"$ROOT/LICENSE" "$ROOT/NOTICE.md"', src)
        self.assertIn('"$PKG_DIR/gpupanel-install-preflight.py"', src)


if __name__ == "__main__":
    unittest.main()
