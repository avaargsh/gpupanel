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
    def test_vm_acceptance_guide_and_lifecycle_use_current_denial_contract(self):
        # Contract guard only: real Ubuntu guest installation remains NOT RUN.
        guide = (ROOT / "docs/operations/local-install-test.md").read_text(encoding="utf-8")
        runtime = (ROOT / "scripts/install-test/runtime.py").read_text(encoding="utf-8")
        self.assertIn("gpupanel-install-preflight.py --json", guide)
        self.assertIn("--approve-disposable-vm-install --entrance itest-local", guide)
        self.assertNotIn("install.sh --entrance itest-local", guide)
        self.assertIn("'install authorization denied' in repeated.stdout", runtime)
        self.assertIn("assert pid_before == pid_after", runtime)

    def test_preflight_precedes_host_mutation_and_private_log_never_retains_password(self):
        src = INSTALLER.read_text(encoding="utf-8")
        start = src.index("\ninit_install_log\nbanner")
        self.assertLess(src.index('python3 "$PREFLIGHT" --json'), start)
        self.assertLess(src.index("\nPY_INSTALL_APPROVAL\n"), start)
        self.assertIn('--approve-disposable-vm-install)', src)
        # No package-supplied Python can execute as root on a default call.
        self.assertLess(
            src.index('[ "$APPROVE_DISPOSABLE_VM_INSTALL" = "1" ] || die'),
            src.index('CORE_SRC="$(pick gpupanel-core'))
        self.assertLess(
            src.index('[ "$APPROVE_DISPOSABLE_VM_INSTALL" = "1" ] || die'),
            src.index('PREFLIGHT="$(pick gpupanel-install-preflight.py'))
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

    def test_real_shell_default_and_bad_report_stop_before_any_host_write(self):
        # Run the REAL shell installer with synthetic release files and a
        # fake non-privileged id binary, but only for paths guaranteed to DENY.
        # The base-dir is disposable and must NEVER be created by this test.
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            script = root / "install.sh"
            script.write_bytes(INSTALLER.read_bytes())
            payload = root / "payload"
            units = payload / "initscript"
            units.mkdir(parents=True)
            for name in ("gpupanel-core", "gpupanel-agent", "pctl", "app.yaml"):
                (payload / name).write_text("synthetic placeholder, never run", encoding="utf-8")
            for name in ("gpupanel-core.service", "gpupanel-agent.service"):
                (units / name).write_text("[Service]\nType=simple\n", encoding="utf-8")
            mock_bin = root / "mock-bin"
            mock_bin.mkdir()
            fake_id = mock_bin / "id"
            fake_id.write_text("#!/bin/sh\nprintf '0\\n'\n", encoding="utf-8")
            fake_id.chmod(0o755)
            env = os.environ.copy()
            env["PATH"] = str(mock_bin) + os.pathsep + env.get("PATH", "")
            target = root / "target"
            checker = payload / "gpupanel-install-preflight.py"
            checker_marker = root / "package-python-was-executed"

            def denied(report, *, approved=False, checker_exit=0):
                checker_marker.unlink(missing_ok=True)
                checker.write_text(
                    "from pathlib import Path\nPath(" + repr(str(checker_marker)) +
                    ").write_text('executed')\nimport sys\nprint(" +
                    repr(json.dumps(report)) + ")\nsys.exit(" +
                    str(checker_exit) + ")\n", encoding="utf-8",
                )
                args = [
                    "bash", str(script), "--payload", str(payload),
                    "--base-dir", str(target),
                ]
                if approved:
                    args.append("--approve-disposable-vm-install")
                run = subprocess.run(args, env=env, capture_output=True, text=True, check=False)
                self.assertNotEqual(run.returncode, 0, run.stdout + run.stderr)
                self.assertFalse(target.exists(), "denied installation mutated the target")
                self.assertFalse((root / "install.log").exists())
                self.assertFalse((payload / "log").exists())
                # Without opt-in, even a tampered release-supplied checker
                # must never be executed with the installer's root identity.
                self.assertEqual(checker_marker.exists(), approved)
                return run

            good = self._preflight_report()
            # This is the original bug: an exit-0 preflight used to silently
            # promote the diagnosis into root system mutation.
            self.assertIn("authorization denied", denied(good).stdout)
            import copy
            blocked = copy.deepcopy(good)
            blocked["blockers"] = ["runtime_collision"]
            denied(blocked, approved=True)
            unknown = copy.deepcopy(good)
            next(c for c in unknown["checks"] if c["code"] == "disk_space")["state"] = "UNKNOWN"
            denied(unknown, approved=True)
            experimental = copy.deepcopy(good)
            next(c for c in experimental["checks"] if c["code"] == "operating_system")["detail"] = "Ubuntu 26.04"
            denied(experimental, approved=True)
            denied(good, approved=True, checker_exit=2)

            # A supplied release must never splice missing pctl, unit files or
            # preflight code from the checkout. Test the real shell before any
            # payload-supplied checker can execute.
            required = (
                "gpupanel-core", "gpupanel-agent", "pctl", "app.yaml",
                "gpupanel-install-preflight.py",
                "initscript/gpupanel-core.service",
                "initscript/gpupanel-agent.service",
            )
            for rel in required:
                with self.subTest(missing_release_file=rel):
                    file = payload / rel
                    data = file.read_bytes()
                    file.unlink()
                    checker_marker.unlink(missing_ok=True)
                    try:
                        result = subprocess.run(
                            ["bash", str(script), "--payload", str(payload),
                             "--base-dir", str(target),
                             "--approve-disposable-vm-install"],
                            env=env, capture_output=True, text=True, check=False,
                        )
                        self.assertNotEqual(result.returncode, 0)
                        self.assertIn("incomplete or redirected release payload", result.stdout)
                        self.assertFalse(target.exists())
                        self.assertFalse(checker_marker.exists(),
                                         "incomplete release executed package checker")
                    finally:
                        file.write_bytes(data)

            empty = subprocess.run(
                ["bash", str(script), "--payload", "",
                 "--base-dir", str(target), "--approve-disposable-vm-install"],
                env=env, capture_output=True, text=True, check=False,
            )
            self.assertNotEqual(empty.returncode, 0)
            self.assertIn("--payload requires a non-empty directory", empty.stdout)
            self.assertFalse(target.exists())

            # Redirecting a release component is not an allowed provenance
            # fallback, even if its destination holds a plausible file.
            original = payload / "pctl"
            content = original.read_bytes()
            original.unlink()
            original.symlink_to(root / "external-pctl")
            try:
                result = subprocess.run(
                    ["bash", str(script), "--payload", str(payload),
                     "--base-dir", str(target), "--approve-disposable-vm-install"],
                    env=env, capture_output=True, text=True, check=False,
                )
                self.assertIn("incomplete or redirected release payload", result.stdout)
                self.assertFalse(target.exists())
            finally:
                original.unlink()
                original.write_bytes(content)

    def test_integrated_preflight_process_and_unit_collisions_reach_installer_denial(self):
        # This is an integrated source contract across both previously
        # separate PRs, using a real preflight report, not hand-crafted JSON.
        import importlib.util
        source = ROOT / "scripts/gpupanel-install-preflight.py"
        spec = importlib.util.spec_from_file_location("combined_install_preflight", source)
        self.assertIsNotNone(spec)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as td:
            host = Path(td)
            (host / "etc").mkdir()
            (host / "etc/os-release").write_text('ID=ubuntu\nVERSION_ID="24.04"\n')
            clean = module.inspect_host(host, free_bytes=module.MIN_FREE_BYTES)
            self.assertEqual(clean["blockers"], [])
            # This asserts parser compatibility, NOT permission to install on
            # a real host: no installer, root, or service code is executed.
            self.assertEqual(self._authorize(clean).returncode, 0)
            process = host / "proc/321"
            process.mkdir(parents=True)
            (process / "comm").write_text("gpupanel-core\n")
            running = module.inspect_host(host, free_bytes=module.MIN_FREE_BYTES)
            self.assertIn("running_panel_process", running["blockers"])
            self.assertNotEqual(self._authorize(running).returncode, 0)
            (process / "comm").unlink()
            vendor = host / "usr/lib/systemd/system/1panel.service"
            vendor.parent.mkdir(parents=True)
            vendor.write_text("[Unit]\nDescription=Legacy panel\n")
            occupied = module.inspect_host(host, free_bytes=module.MIN_FREE_BYTES)
            self.assertIn("runtime_collision", occupied["blockers"])
            self.assertNotEqual(self._authorize(occupied).returncode, 0)

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
