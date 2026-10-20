"""Offline-first workstation profile tests; apt, Polkit, DevPod are always mocked."""
import importlib.util
import json
import subprocess
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("workstation", ROOT / "scripts/gpupanel-workstation.py")
ws = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ws)


class WorkstationTests(unittest.TestCase):
    def setUp(self):
        self.profile = ws.load(ROOT / "profiles/ubuntu24-workstation.v1.json")

    def test_roundtrip_digest(self):
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp) / "profile.json"
            file.write_bytes(ws.canonical(self.profile))
            self.assertEqual(ws.digest(self.profile), ws.digest(ws.load(file)))

    def test_untrusted_packages_and_mirrors_denied(self):
        cases = [
            {"aptPackages": ["docker.io;rm -rf ~"]},
            {"mirrors": {**self.profile["mirrors"], "GOPROXY": "http://bad.test"}},
            {"mirrors": {**self.profile["mirrors"], "GOPROXY": "https://x:y@bad.test"}},
            {"mirrors": {**self.profile["mirrors"], "GOPROXY": "https://bad.test/;id"}},
            {"tools": [{"name": "bad", "command": "evil;id", "required": True}]},
        ]
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp) / "profile.json"
            for case in cases:
                file.write_text(json.dumps({**self.profile, **case}))
                with self.subTest(case=case), self.assertRaises(ws.WorkstationError):
                    ws.load(file)

    def test_missing_docker_core_kubernetes_is_fine(self):
        def fail(*_, **__):
            return SimpleNamespace(returncode=1, stdout="")
        result = ws.inspect(self.profile, which=lambda _: None, runner=fail, os_ok=True)
        self.assertEqual(result["status"], "READY")
        self.assertEqual(result["requires"], {"docker": False, "core": False, "kubernetes": False})

    def test_restore_approval_conflict_and_idempotency(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(ws.os, "geteuid", return_value=1000):
            home = Path(tmp)
            config = home / ".config/gpupanel/workstation-profile.json"
            self.assertEqual(ws.restore(self.profile, "bad", home=home)["status"], "APPROVAL_REQUIRED")
            self.assertFalse(config.exists())
            self.assertEqual(ws.restore(self.profile, ws.digest(self.profile), home=home)["status"], "VERIFIED")
            self.assertEqual(ws.restore(self.profile, ws.digest(self.profile), home=home)["status"], "VERIFIED_EXISTING")
            config.write_text("operator setting")
            self.assertEqual(ws.restore(self.profile, ws.digest(self.profile), home=home)["status"], "CONFLICT_NO_OVERWRITE")
            self.assertEqual(config.read_text(), "operator setting")

    def test_symlink_never_overwrites_victim(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            config = home / ".config/gpupanel/workstation-profile.json"
            config.parent.mkdir(parents=True)
            victim = home / "victim"
            victim.write_text("untouched")
            config.symlink_to(victim)
            with self.assertRaises(ws.WorkstationError):
                ws.restore(self.profile, ws.digest(self.profile), home=home)
            self.assertEqual(victim.read_text(), "untouched")

    def test_apt_digest_and_failed_execution_unknown(self):
        def fake(args, **_):
            return SimpleNamespace(returncode=1, stdout="", stderr="failed")
        plan = ws.install_plan(self.profile, runner=fake, os_ok=True)
        self.assertEqual(plan["status"], "READY_FOR_APPROVAL")
        self.assertEqual(plan["command"][:4], ["/usr/bin/pkexec", "--disable-internal-agent", "/usr/bin/apt-get", "install"])
        self.assertEqual(ws.install_apt(self.profile, "wrong", runner=fake, os_ok=True)["status"], "REFUSED_PLAN_MISMATCH")
        with mock.patch.object(ws.os, "geteuid", return_value=1000), \
             mock.patch.object(ws.Path, "is_file", return_value=True):
            result = ws.install_apt(self.profile, plan["planDigest"], runner=fake, os_ok=True)
        self.assertEqual(result["status"], "UNKNOWN")
        self.assertTrue(result["executed"])

    def test_polkit_cancel_deny_and_no_agent_are_distinct_from_unknown(self):
        for exit_code, state in ((126, "AUTH_CANCELLED"), (127, "AUTH_NOT_GRANTED")):
            calls = []
            def runner(command, **kwargs):
                calls.append(command)
                if command[0] == "/usr/bin/pkexec":
                    self.assertEqual(command[1], "--disable-internal-agent")
                    self.assertEqual(command[2:4], ["/usr/bin/apt-get", "install"])
                    return SimpleNamespace(returncode=exit_code, stdout="", stderr="PRIVATE_AGENT_ERROR")
                return SimpleNamespace(returncode=1, stdout="", stderr="")
            plan = ws.install_plan(self.profile, runner=runner, os_ok=True)
            with self.subTest(exit_code=exit_code), \\
                 mock.patch.object(ws.os, "geteuid", return_value=1000), \\
                 mock.patch.object(ws.Path, "is_file", return_value=True):
                result = ws.install_apt(self.profile, plan["planDigest"], runner=runner, os_ok=True)
            self.assertEqual(result["status"], state)
            self.assertFalse(result["executed"])
            self.assertFalse(result["reconciliationRequired"])
            self.assertEqual(sum(c[0] == "/usr/bin/pkexec" for c in calls), 1)
            self.assertNotIn("PRIVATE_AGENT_ERROR", json.dumps(result))

    def test_polkit_timeout_unknown_and_partial_apt_fail_closed(self):
        for exit_code in (0, 100):
            def runner(command, **kwargs):
                if command[0] == "/usr/bin/pkexec":
                    return SimpleNamespace(returncode=exit_code, stdout="private", stderr="SECRET")
                return SimpleNamespace(returncode=1, stdout="", stderr="")
            plan = ws.install_plan(self.profile, runner=runner, os_ok=True)
            with self.subTest(exit_code=exit_code), \\
                 mock.patch.object(ws.os, "geteuid", return_value=1000), \\
                 mock.patch.object(ws.Path, "is_file", return_value=True):
                result = ws.install_apt(self.profile, plan["planDigest"], runner=runner, os_ok=True)
            self.assertEqual(result["status"], "UNKNOWN")
            self.assertTrue(result["executed"])
            self.assertTrue(result["reconciliationRequired"])
            self.assertNotIn("SECRET", json.dumps(result))

        def timed_out(command, **kwargs):
            if command[0] == "/usr/bin/pkexec":
                raise subprocess.TimeoutExpired(command, 240)
            return SimpleNamespace(returncode=1, stdout="", stderr="")
        plan = ws.install_plan(self.profile, runner=timed_out, os_ok=True)
        with mock.patch.object(ws.os, "geteuid", return_value=1000), \\
             mock.patch.object(ws.Path, "is_file", return_value=True):
            result = ws.install_apt(self.profile, plan["planDigest"], runner=timed_out, os_ok=True)
        self.assertEqual(result["status"], "UNKNOWN")
        self.assertTrue(result["reconciliationRequired"])

    def test_polkit_approved_and_observed_packages_verified(self):
        invoked = []
        def runner(command, **kwargs):
            invoked.append(command)
            if command[0] == "/usr/bin/pkexec":
                return SimpleNamespace(returncode=0, stdout="", stderr="")
            if any(c[0] == "/usr/bin/pkexec" for c in invoked):
                return SimpleNamespace(returncode=0, stdout="install ok installed", stderr="")
            return SimpleNamespace(returncode=1, stdout="", stderr="")
        plan = ws.install_plan(self.profile, runner=runner, os_ok=True)
        with mock.patch.object(ws.os, "geteuid", return_value=1000), \\
             mock.patch.object(ws.Path, "is_file", return_value=True):
            outcome = ws.install_apt(self.profile, plan["planDigest"], runner=runner, os_ok=True)
        self.assertEqual(outcome["status"], "VERIFIED")
        self.assertTrue(outcome["executed"])
        self.assertFalse(outcome["reconciliationRequired"])
        self.assertEqual(outcome["installed"], self.profile["aptPackages"])

    def test_devpod_is_an_optional_plan(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            project = home / "GPUPanel/projects/example"
            project.mkdir(parents=True)
            self.assertEqual(ws.devpod_plan(project, which=lambda _: None, home=home)["status"],
                             "OPTIONAL_PROVIDER_MISSING")
            (project / ".devcontainer").mkdir()
            (project / ".devcontainer/devcontainer.json").write_text('{"image":"alpine"}')
            planned = ws.devpod_plan(project, which=lambda x: "/usr/bin/devpod" if x == "devpod" else None, home=home)
            self.assertEqual(planned["status"], "READY_FOR_PROVIDER_CHECK")
            self.assertEqual(planned["command"], ["devpod", "up", str(project), "--ide", "openvscode"])
            self.assertEqual(ws.devpod_plan(home, home=home)["status"], "INVALID_PROJECT")

    def test_version_audit_is_bounded_and_never_queries_docker_daemon(self):
        calls = []
        def fake(args, **kwargs):
            calls.append(args)
            return SimpleNamespace(returncode=0, stdout="git version 2.47.0\n", stderr="")
        audit = ws.versions(which=lambda x: "/usr/bin/" + x if x in ("git", "docker") else None,
                            runner=fake)
        self.assertEqual(audit["status"], "READ_ONLY")
        self.assertFalse(audit["daemonChecked"])
        self.assertEqual(calls, [["/usr/bin/git", "--version"], ["/usr/bin/docker", "--version"]])
        self.assertEqual(next(x for x in audit["tools"] if x["tool"] == "python3")["status"], "NOT_FOUND")

    def test_version_escape_sequence_rejected(self):
        def malicious(args, **kwargs):
            return SimpleNamespace(returncode=0, stdout="\x1b[31msecret", stderr="")
        audit = ws.versions(which=lambda _: "/usr/bin/mock", runner=malicious)
        self.assertTrue(all(t["status"] == "VERSION_UNVERIFIED" for t in audit["tools"]))

    def test_mirror_exports_session_only(self):
        lines = ws.env_lines(self.profile)
        self.assertIn("export UV_DEFAULT_INDEX=", lines)
        self.assertNotIn("TOKEN", lines)


if __name__ == "__main__":
    unittest.main()
