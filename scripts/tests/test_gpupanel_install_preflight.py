import importlib.util
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "gpupanel-install-preflight.py"
spec = importlib.util.spec_from_file_location("gpupanel_install_preflight", SCRIPT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class InstallPreflightTests(unittest.TestCase):
    def setUp(self):
        self.t = tempfile.TemporaryDirectory()
        self.addCleanup(self.t.cleanup)
        self.root = Path(self.t.name)
        (self.root / "etc").mkdir()
        (self.root / "etc/os-release").write_text('ID=ubuntu\nVERSION_ID="24.04"\n')

    def test_clean_fixture_reports_no_collisions_but_never_install_ready(self):
        result = mod.inspect_host(self.root, free_bytes=mod.MIN_FREE_BYTES)
        self.assertEqual(result["blockers"], [])
        self.assertFalse(result["installable"])
        self.assertFalse(result["safe_to_install"])

    def test_existing_panel_path_blocks(self):
        (self.root / "usr/local/bin").mkdir(parents=True)
        (self.root / "usr/local/bin/1pctl").write_text("old panel")
        result = mod.inspect_host(self.root, free_bytes=mod.MIN_FREE_BYTES)
        self.assertIn("runtime_collision", result["blockers"])

    def test_existing_gpupanel_state_blocks_before_overwrite(self):
        (self.root / "etc/gpupanel").mkdir()
        result = mod.inspect_host(self.root, free_bytes=mod.MIN_FREE_BYTES)
        self.assertIn("runtime_collision", result["blockers"])
        self.assertIn("/etc/gpupanel", next(
            x["detail"] for x in result["checks"] if x["code"] == "runtime_collision"))
        self.assertFalse(result["safe_to_install"])

    def test_existing_gpupanel_service_blocks(self):
        (self.root / "etc/systemd/system").mkdir(parents=True)
        (self.root / "etc/systemd/system/gpupanel-agent.service").write_text("service")
        result = mod.inspect_host(self.root, free_bytes=mod.MIN_FREE_BYTES)
        self.assertIn("runtime_collision", result["blockers"])

    def test_runtime_parent_symlink_blocks_even_without_target_file(self):
        (self.root / "usr").symlink_to("/does-not-exist")
        result = mod.inspect_host(self.root, free_bytes=mod.MIN_FREE_BYTES)
        self.assertIn("runtime_path_symlink", result["blockers"])
        self.assertIn("/usr", next(
            x["detail"] for x in result["checks"] if x["code"] == "runtime_path_symlink"))
        self.assertFalse(result["installable"])

    def test_nested_runtime_parent_symlink_blocks(self):
        (self.root / "etc/systemd").mkdir(parents=True)
        (self.root / "etc/systemd/system").symlink_to("/missing-outside-fixture")
        result = mod.inspect_host(self.root, free_bytes=mod.MIN_FREE_BYTES)
        self.assertIn("runtime_path_symlink", result["blockers"])
        self.assertIn("/etc/systemd/system", next(
            x["detail"] for x in result["checks"] if x["code"] == "runtime_path_symlink"))

    def test_symlink_dangling_collision_blocks(self):
        (self.root / "etc/1panel").symlink_to("/missing-link-on-purpose")
        result = mod.inspect_host(self.root, free_bytes=mod.MIN_FREE_BYTES)
        self.assertIn("runtime_collision", result["blockers"])

    def test_unsupported_os_blocks(self):
        (self.root / "etc/os-release").write_text('ID=debian\nVERSION_ID="12"\n')
        result = mod.inspect_host(self.root, free_bytes=mod.MIN_FREE_BYTES)
        self.assertIn("operating_system", result["blockers"])

    def test_insufficient_space_blocks(self):
        result = mod.inspect_host(self.root, free_bytes=mod.MIN_FREE_BYTES - 1)
        self.assertIn("disk_space", result["blockers"])

    def test_unknown_space_does_not_claim_pass(self):
        from unittest.mock import patch
        with patch.object(mod.shutil, "disk_usage", side_effect=OSError):
            result = mod.inspect_host(self.root)
        disk = next(x for x in result["checks"] if x["code"] == "disk_space")
        self.assertEqual(disk["state"], "UNKNOWN")

    def test_no_commands_executed(self):
        from unittest.mock import patch
        import subprocess
        with patch.object(subprocess, "run", side_effect=AssertionError("command execution attempted")):
            mod.inspect_host(self.root, free_bytes=mod.MIN_FREE_BYTES)


if __name__ == "__main__":
    unittest.main()
