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

    def test_vendor_systemd_unit_blocks_without_etc_unit(self):
        unit = self.root / "usr/lib/systemd/system/1panel.service"
        unit.parent.mkdir(parents=True)
        unit.write_text("[Unit]\\nDescription=Legacy panel\\n")
        result = mod.inspect_host(self.root, free_bytes=mod.MIN_FREE_BYTES)
        self.assertIn("runtime_collision", result["blockers"])
        self.assertIn("/usr/lib/systemd/system/1panel.service", next(
            x["detail"] for x in result["checks"] if x["code"] == "runtime_collision"))
        self.assertFalse(result["safe_to_install"])

    def test_dangling_enabled_service_symlink_blocks(self):
        unit = self.root / "etc/systemd/system/multi-user.target.wants/gpupanel-core.service"
        unit.parent.mkdir(parents=True)
        unit.symlink_to("/missing-or-removed-gpupanel-unit")
        result = mod.inspect_host(self.root, free_bytes=mod.MIN_FREE_BYTES)
        self.assertIn("runtime_collision", result["blockers"])
        self.assertFalse(result["installable"])

    def test_runtime_systemd_unit_blocks(self):
        unit = self.root / "run/systemd/system/gpupanel-agent.service"
        unit.parent.mkdir(parents=True)
        unit.write_text("[Unit]\\nDescription=Panel agent\\n")
        self.assertIn("runtime_collision", mod.inspect_host(
            self.root, free_bytes=mod.MIN_FREE_BYTES)["blockers"])

    def test_vendor_unit_parent_redirect_blocks_without_leaf(self):
        parent = self.root / "usr/lib"
        parent.mkdir(parents=True)
        (parent / "systemd").symlink_to("/missing-systemd-parent")
        result = mod.inspect_host(self.root, free_bytes=mod.MIN_FREE_BYTES)
        self.assertIn("runtime_path_symlink", result["blockers"])
        self.assertFalse(result["safe_to_install"])

    def test_symlink_dangling_collision_blocks(self):
        (self.root / "etc/1panel").symlink_to("/missing-link-on-purpose")
        result = mod.inspect_host(self.root, free_bytes=mod.MIN_FREE_BYTES)
        self.assertIn("runtime_collision", result["blockers"])

    def test_unsupported_os_blocks(self):
        (self.root / "etc/os-release").write_text('ID=debian\nVERSION_ID="12"\n')
        result = mod.inspect_host(self.root, free_bytes=mod.MIN_FREE_BYTES)
        self.assertIn("operating_system", result["blockers"])

    def test_experimental_26_never_bypasses_collisions_or_other_os(self):
        (self.root / "etc/os-release").write_text('ID=ubuntu\nVERSION_ID="26.04"\n')
        self.assertIn("operating_system", mod.inspect_host(self.root, mod.MIN_FREE_BYTES)["blockers"])
        result = mod.inspect_host(self.root, mod.MIN_FREE_BYTES, experimental_ubuntu_26=True)
        self.assertEqual(result["blockers"], [])
        self.assertEqual(next(x for x in result["checks"] if x["code"] == "operating_system")["state"], "UNKNOWN")
        (self.root / "etc/gpupanel").mkdir()
        self.assertIn("runtime_collision", mod.inspect_host(self.root, mod.MIN_FREE_BYTES, True)["blockers"])
        (self.root / "etc/os-release").write_text('ID=debian\nVERSION_ID="12"\n')
        self.assertIn("operating_system", mod.inspect_host(self.root, mod.MIN_FREE_BYTES, True)["blockers"])

    def test_agent_health_requires_real_successful_unix_http_response(self):
        import http.server
        import socketserver
        import threading
        reply = [b'{"code":200}']
        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200)
                self.send_header('Content-Length', str(len(reply[0])))
                self.end_headers()
                self.wfile.write(reply[0])
            def log_message(self, *args):
                pass
        socket_path = str(self.root / 'health.sock')
        server = socketserver.UnixStreamServer(socket_path, Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            self.assertTrue(mod.agent_healthy(socket_path))
            reply[0] = b'{"code":500}'
            self.assertFalse(mod.agent_healthy(socket_path))
            reply[0] = b'not JSON'
            self.assertFalse(mod.agent_healthy(socket_path))
            self.assertFalse(mod.agent_healthy(str(self.root / 'missing.sock')))
        finally:
            server.shutdown()
            server.server_close()
            thread.join(1)

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
