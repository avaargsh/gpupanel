"""Regression tests for safe GPUPanel service teardown and explicit purge."""
import argparse
import importlib.util
from pathlib import Path
import tempfile
import subprocess
from unittest import mock
import unittest

ROOT = Path(__file__).resolve().parents[2]
HELPER_PATH = ROOT / "scripts/gpupanel-uninstall-preflight.py"
UNINSTALLER_PATH = ROOT / "deploy/uninstall.sh"
SPEC = importlib.util.spec_from_file_location("gpupanel_uninstall_preflight", HELPER_PATH)
helper = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(helper)


class UninstallPreflightTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.base = self.root / "opt"
        self.panel = self.base / "gpupanel"
        self.unit_dir = self.root / "systemd"
        self.panel.mkdir(parents=True)
        self.unit_dir.mkdir()
        (self.panel / "pctl").write_text(
            "#!/bin/bash\nBASE_DIR=" + str(self.base) + "\n", encoding="utf-8"
        )
        (self.panel / "pctl").chmod(0o700)
        for name in ("gpupanel-core", "gpupanel-agent"):
            binary = self.panel / name
            binary.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
            binary.chmod(0o755)
            (self.unit_dir / (name + ".service")).write_text(
                "[Service]\n"
                "WorkingDirectory=" + str(self.panel) + "\n"
                "ExecStart=" + str(binary) + "\n",
                encoding="utf-8",
            )

    def args(self, **overrides):
        values = {
            "base_dir": str(self.base),
            "unit_dir": str(self.unit_dir),
            "systemd": False,
            "no_systemd": True,
            "assert_stopped": False,
            "units_removed": False,
            "purge": False,
            "confirm_purge": "",
        }
        values.update(overrides)
        return argparse.Namespace(**values)

    def test_valid_install_is_bound_to_exact_pctl_and_unit_paths(self):
        with mock.patch.object(helper, "process_paths", return_value=[]):
            plan = helper.build_plan(self.args())
        self.assertTrue(plan["ready_to_execute"])
        self.assertEqual(plan["panel_dir"], str(self.panel))
        self.assertEqual(plan["data_policy"], "PRESERVE_INSTALLATION_DIRECTORY")
        self.assertEqual(plan["verified_unit_names"], ["gpupanel-agent", "gpupanel-core"])

    def test_symlinked_installation_path_is_rejected(self):
        outside = self.root / "owned-elsewhere"
        outside.mkdir()
        for item in self.panel.iterdir():
            item.unlink()
        self.panel.rmdir()
        self.panel.symlink_to(outside, target_is_directory=True)
        with self.assertRaises(helper.Refusal):
            helper.build_plan(self.args())

    def test_group_or_world_writable_binary_and_unit_are_rejected(self):
        binary = self.panel / "gpupanel-core"
        binary.chmod(0o777)
        with self.assertRaisesRegex(helper.Refusal, "writable by group/world"):
            helper.build_plan(self.args())
        binary.chmod(0o755)
        unit = self.unit_dir / "gpupanel-agent.service"
        unit.chmod(0o666)
        with self.assertRaisesRegex(helper.Refusal, "writable by group/world"):
            helper.build_plan(self.args())

    def test_pctl_base_dir_mismatch_is_rejected(self):
        (self.panel / "pctl").write_text("#!/bin/bash\nBASE_DIR=/another/install\n", encoding="utf-8")
        with self.assertRaisesRegex(helper.Refusal, "BASE_DIR"):
            helper.build_plan(self.args())

    def test_unit_execstart_for_another_install_is_rejected(self):
        unit = self.unit_dir / "gpupanel-core.service"
        unit.write_text(
            "[Service]\nWorkingDirectory=/opt/other\nExecStart=/opt/other/gpupanel-core\n",
            encoding="utf-8",
        )
        with self.assertRaisesRegex(helper.Refusal, "does not uniquely execute"):
            helper.build_plan(self.args())

    def test_unreviewed_execstop_hook_is_rejected_before_mutation(self):
        unit = self.unit_dir / "gpupanel-core.service"
        unit.write_text(
            "[Service]\n"
            "WorkingDirectory=" + str(self.panel) + "\n"
            "ExecStart=" + str(self.panel / "gpupanel-core") + "\n"
            "ExecStop=/bin/sh -c 'echo unexpected'\n",
            encoding="utf-8",
        )
        with self.assertRaisesRegex(helper.Refusal, "unreviewed execution hook"):
            helper.build_plan(self.args())

    def test_systemd_dropins_are_rejected_before_stop(self):
        def show(name, prop):
            if prop == "FragmentPath":
                return str(self.unit_dir / (name + ".service"))
            if prop == "DropInPaths" and name == "gpupanel-core":
                return "/etc/systemd/system/gpupanel-core.service.d/override.conf"
            return ""
        with mock.patch.object(helper, "systemd_show", side_effect=show):
            with self.assertRaisesRegex(helper.Refusal, "unreviewed drop-ins"):
                helper.build_plan(self.args(systemd=True))

    def test_systemd_query_failure_before_stop_is_rejected(self):
        with mock.patch.object(helper.subprocess, "run", return_value=subprocess.CompletedProcess(
            ["systemctl", "show"], 1, stdout="", stderr="manager unavailable"
        )):
            with self.assertRaisesRegex(helper.Refusal, "systemd query failed"):
                helper.verify_systemd_fragment(self.unit_dir, "gpupanel-core")

    def test_post_removal_query_failure_is_not_treated_as_absence(self):
        values = iter(("not-found", "inactive", "", ""))
        with mock.patch.object(helper, "systemd_show", side_effect=lambda *_: next(values)), \
             mock.patch.object(helper.subprocess, "run", return_value=subprocess.CompletedProcess(
                 ["systemctl", "is-enabled"], 1, stdout="bad\n", stderr="query failure\n"
             )):
            with self.assertRaisesRegex(helper.Refusal, "enabled state is not"):
                helper.verify_systemd_unit_absent("gpupanel-core")

    def test_process_identity_permission_failure_is_not_treated_as_absence(self):
        original_iterdir = Path.iterdir
        def fake_iterdir(path):
            if path == Path("/proc"):
                return iter((Path("/proc/123"),))
            return original_iterdir(path)
        with mock.patch.object(Path, "iterdir", fake_iterdir), \
             mock.patch.object(helper.os, "readlink", side_effect=PermissionError("denied")):
            with self.assertRaisesRegex(helper.Refusal, "cannot inspect process identity"):
                helper.process_paths(self.panel)

    def test_systemd_mode_requires_both_owned_units(self):
        (self.unit_dir / "gpupanel-agent.service").unlink()
        with mock.patch.object(helper, "verify_systemd_fragment"):
            with self.assertRaisesRegex(helper.Refusal, "both matching"):
                helper.build_plan(self.args(systemd=True))

    def test_running_process_without_systemd_is_rejected(self):
        with mock.patch.object(helper, "process_paths", return_value=["1234"]):
            with self.assertRaisesRegex(helper.Refusal, "process is running"):
                helper.build_plan(self.args())

    def test_purge_requires_exact_confirmation_and_rejects_mountpoint(self):
        with mock.patch.object(helper, "process_paths", return_value=[]):
            with self.assertRaisesRegex(helper.Refusal, "exact normalized"):
                helper.build_plan(self.args(purge=True))
            with mock.patch.object(helper, "mounted_at", return_value=True):
                with self.assertRaisesRegex(helper.Refusal, "mount point"):
                    helper.build_plan(self.args(purge=True, confirm_purge=str(self.panel)))

    def test_repeated_confirmed_purge_is_allowed_only_after_owned_units_are_absent(self):
        (self.unit_dir / "gpupanel-core.service").unlink()
        (self.unit_dir / "gpupanel-agent.service").unlink()
        with mock.patch.object(helper, "process_paths", return_value=[]), \
             mock.patch.object(helper, "mounted_at", return_value=False):
            plan = helper.build_plan(self.args(
                units_removed=True, purge=True, confirm_purge=str(self.panel)
            ))
        self.assertEqual(plan["data_policy"], "DELETE_EXACT_CONFIRMED_PANEL_DIR")

    def test_post_removal_verifier_requires_owned_units_to_be_absent(self):
        (self.unit_dir / "gpupanel-core.service").unlink()
        with mock.patch.object(helper, "process_paths", return_value=[]):
            with self.assertRaisesRegex(helper.Refusal, "unit files still exist"):
                helper.build_plan(self.args(units_removed=True))

    def test_live_uninstall_runs_after_restore_and_must_be_attested(self):
        runner = (ROOT / "scripts/install-test/ci-live-vm.sh").read_text(encoding="utf-8")
        evidence = (ROOT / "scripts/install-test/ci-evidence.py").read_text(encoding="utf-8")
        live = (ROOT / "scripts/install-test/uninstall-live.py").read_text(encoding="utf-8")
        self.assertLess(runner.index("scripts/install-test/restore-live.py"),
                        runner.index("scripts/install-test/uninstall-live.py"))
        self.assertIn("stage 'guest_system_uninstall_preserved_data'", runner)
        self.assertIn('"system_uninstall": "PASS" if success else "NOT_ATTESTED"', evidence)
        self.assertIn('"purge": "NOT_RUN"', live)
        self.assertLessEqual(len(live.splitlines()), 500)

    def test_uninstaller_stops_only_verified_units_and_never_kills_by_name(self):
        source = UNINSTALLER_PATH.read_text(encoding="utf-8")
        syntax = subprocess.run(["bash", "-n", str(UNINSTALLER_PATH)],
                                capture_output=True, text=True, check=False)
        self.assertEqual(syntax.returncode, 0, syntax.stderr)
        self.assertIn("gpupanel-uninstall-preflight.py", source)
        helper_source = HELPER_PATH.read_text(encoding="utf-8")
        self.assertIn("DropInPaths", helper_source)
        self.assertIn('LoadState") != "not-found"', helper_source)
        live_source = (ROOT / "scripts/install-test/uninstall-live.py").read_text(encoding="utf-8")
        self.assertIn("retained_tree_digest", live_source)
        self.assertIn("retention_sentinel_sha256", live_source)
        self.assertIn('"retained_tree_unchanged": before["retained_tree_sha256"] == after["retained_tree_sha256"]', live_source)
        self.assertIn("retained_tree_unchanged", (ROOT / "scripts/install-test/ci-evidence.py").read_text(encoding="utf-8"))
        self.assertIn("systemctl disable --now gpupanel-agent.service gpupanel-core.service", source)
        self.assertNotIn("pkill", source)
        self.assertNotIn("|| true", source)
        self.assertIn("--assert-stopped", source)
        self.assertIn("--units-removed --purge --confirm-purge", source)
        self.assertIn("trap 'exit 129' HUP", source)
        self.assertIn("trap 'exit 130' INT", source)
        self.assertIn("trap 'exit 143' TERM", source)
        self.assertIn("trap restore_units_on_failure EXIT", source)
        self.assertIn("UNIT_REMOVAL_STARTED=1", source)
        self.assertIn("possibly half-staged backup", source)
        self.assertIn("--units-removed >/dev/null", source)
        self.assertLess(source.index("--units-removed >/dev/null"),
                        source.index("UNIT_REMOVAL_COMMITTED=1"))
        self.assertIn("rm -rf --one-file-system --", source)
        self.assertIn('printf \'Binaries, configuration, database and user data remain', source)


if __name__ == "__main__":
    unittest.main()
