"""Source-level and unprivileged CLI guards; never install host services."""
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
INSTALLER = ROOT / "deploy/install.sh"


class LocalDeployContract(unittest.TestCase):
    def test_preflight_precedes_host_mutation_and_private_log_never_retains_password(self):
        src = INSTALLER.read_text(encoding="utf-8")
        start = src.index("\ninit_install_log\nbanner")
        self.assertLess(src.index('python3 "$PREFLIGHT" --json'), start)
        self.assertLess(src.index('assert_kv_safe PASSWORD'), start)
        self.assertLess(start, src.index('mkdir -p "$PANEL_DIR" "$CONF_DIR"'))
        self.assertNotIn("pkill", "\n".join(line for line in src.splitlines() if not line.startswith("#")))
        self.assertIn('LOG_FILE="$PANEL_DIR/log/install.log"', src)
        self.assertIn('chmod 0600 "$LOG_FILE"', src)
        self.assertIn('umask 077', src)
        self.assertNotIn('log "  password     : $PASSWORD"', src)
        self.assertIn('install -m 0700 "$PCTL_SRC"', src)

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
