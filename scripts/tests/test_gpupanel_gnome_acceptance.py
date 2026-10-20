"""No GUI and no host mutation: GNOME acceptance fail-closed contracts."""
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("gpupanel_gnome",
                                                ROOT / "scripts/gpupanel-gnome-acceptance.py")
gnome = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gnome)

RELEASE = 'ID=ubuntu\nVERSION_ID="24.04"\n'
ENV = {
    "XDG_SESSION_TYPE": "wayland",
    "XDG_CURRENT_DESKTOP": "ubuntu:GNOME",
    "XDG_RUNTIME_DIR": "/run/user/1000",
    "WAYLAND_DISPLAY": "wayland-0",
    "DBUS_SESSION_BUS_ADDRESS": "unix:path=/run/user/1000/bus",
}
DIR = SimpleNamespace(st_mode=stat.S_IFDIR | 0o700, st_uid=1000)
SOCK = SimpleNamespace(st_mode=stat.S_IFSOCK | 0o700, st_uid=1000)


def validate(env=None, *, uid=1000, release=RELEASE, directory=DIR, socket=SOCK):
    return gnome.preflight(ENV if env is None else env, release, uid=uid,
                           runtime_stat=directory, socket_stat=socket)


class AcceptanceTests(unittest.TestCase):
    def test_readiness_does_not_prove_gui_or_sandbox(self):
        value = validate()
        self.assertEqual(value["status"], "ELIGIBLE_FOR_MANUAL_CHECK")
        self.assertFalse(value["normalWebkitSandboxVerified"])
        self.assertFalse(value["realGuiVerified"])
        self.assertFalse(value["polkitVerified"])
        self.assertFalse(value["completeRestoreVerified"])
        self.assertEqual(value["reasons"], [])

    def test_ci_sandbox_bypass_and_fake_session_refused(self):
        cases = [
            ({**ENV, "WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS": "1"}, "WEBKIT_SANDBOX_BYPASS_PRESENT"),
            ({**ENV, "GPUPANEL_CI_WEBKIT_UNSANDBOXED": "0"}, "WEBKIT_SANDBOX_BYPASS_PRESENT"),
            ({**ENV, "XDG_SESSION_TYPE": "x11"}, "NOT_WAYLAND_SESSION"),
            ({**ENV, "XDG_CURRENT_DESKTOP": "ubuntu:Unity"}, "NOT_GNOME_DESKTOP"),
            ({**ENV, "GDK_BACKEND": "x11"}, "GTK_NOT_WAYLAND"),
            ({**ENV, "WAYLAND_DISPLAY": "../../other"}, "WAYLAND_SOCKET_UNRESOLVED"),
            ({**ENV, "DBUS_SESSION_BUS_ADDRESS": ""}, "SESSION_DBUS_UNAVAILABLE"),
        ]
        for environment, code in cases:
            with self.subTest(code=code):
                value = validate(environment)
                self.assertEqual(value["status"], "BLOCKED")
                self.assertIn(code, value["reasons"])

    def test_bad_socket_os_root_and_ownership_blocked(self):
        self.assertIn("ROOT_SESSION", validate(uid=0)["reasons"])
        self.assertIn("UNSUPPORTED_OS", validate(release='ID=debian\nVERSION_ID="12"')["reasons"])
        self.assertIn("WAYLAND_SOCKET_MISSING", validate(socket=None)["reasons"])
        self.assertIn("UNTRUSTED_RUNTIME_DIR", validate(directory=None)["reasons"])
        self.assertIn("UNTRUSTED_RUNTIME_DIR", validate(
            directory=SimpleNamespace(st_mode=stat.S_IFDIR | 0o700, st_uid=1001),
        )["reasons"])
        self.assertIn("WAYLAND_SOCKET_MISSING", validate(
            socket=SimpleNamespace(st_mode=stat.S_IFREG | 0o600, st_uid=1000),
        )["reasons"])

    def test_verified_binary_hash_vs_tampered_or_linked(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "gpupanel-desktop"
            file.write_bytes(b"test-only executable")
            file.chmod(0o700)
            import hashlib
            digest = hashlib.sha256(file.read_bytes()).hexdigest()
            self.assertTrue(gnome.reviewed_binary(file, digest)["binaryHashMatched"])
            with file.open("ab") as output: output.write(b"tampered")
            with self.assertRaisesRegex(ValueError, "differs"):
                gnome.reviewed_binary(file, digest)
            file.unlink()
            file.symlink_to("/bin/true")
            with self.assertRaises(ValueError):
                gnome.reviewed_binary(file, digest)

    def test_private_report_without_exposing_personal_environment(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            report = {"status": "RECORDED_REQUIRES_INDEPENDENT_REVIEW",
                      "productionAcceptance": "NOT_PROVEN"}
            with mock.patch.object(gnome.time, "strftime", return_value="20261020T140000"):
                target = gnome.private_report(report, home)
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            self.assertEqual(json.loads(target.read_text()), report)
            self.assertNotIn("HOME", target.read_text())
            linked = home / "GPUPanel" / "acceptance"
            target.unlink()
            linked.rmdir()
            linked.symlink_to(home)
            with self.assertRaises(ValueError):
                gnome.private_report(report, home)

    def test_existing_shared_directory_is_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            root = home / "GPUPanel"
            root.mkdir(mode=0o700)
            root.chmod(0o755)
            with self.assertRaisesRegex(ValueError, "mode 0700"):
                gnome.private_report({"status": "test"}, home)

    def test_cli_preserves_symlink_for_binary_rejection(self):
        with tempfile.TemporaryDirectory() as directory:
            link = Path(directory) / "preview"
            link.symlink_to("/bin/true")
            argv = ["gpupanel-gnome-acceptance.py", "--run", "--binary",
                    str(link), "--expected-sha256", "0" * 64]
            seen = []
            with mock.patch("sys.argv", argv), \
                 mock.patch.object(gnome, "current_preflight", return_value={
                     "status": "ELIGIBLE_FOR_MANUAL_CHECK"}), \
                 mock.patch.object(gnome, "run_manual",
                                   side_effect=lambda binary, pre, *, expected:
                                   seen.append(binary) or 0):
                self.assertEqual(gnome.main(), 0)
            self.assertEqual(len(seen), 1)
            self.assertTrue(seen[0].is_symlink())

    def test_manual_session_never_runs_on_runner_sandbox_bypass(self):
        with mock.patch.object(gnome, "reviewed_binary") as verifier, \
             mock.patch.object(gnome.subprocess, "Popen") as start:
            blocked = validate({**ENV, "WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS": "1"})
            self.assertEqual(gnome.run_manual(Path("/not/a/real/binary"), blocked,
                                               expected="0" * 64), 3)
            verifier.assert_not_called()
            start.assert_not_called()


if __name__ == "__main__":
    unittest.main()
