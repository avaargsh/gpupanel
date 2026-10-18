"""Opt-in Docker Host evidence: reject remote context and unsafe commands."""
import importlib.util
import json
import sys
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("gpupanel_host_investigate", ROOT / "scripts/gpupanel-host-investigate.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
ID = "a" * 64
STATE = {"Status": "exited", "Running": False, "ExitCode": 137, "OOMKilled": True,
         "StartedAt": "2026-10-15T01:00:00Z", "FinishedAt": "2026-10-15T01:01:00Z",
         "Health": {"Status": "unhealthy", "Log": [{"Output": "SENSITIVE SECRET"}]},
         "Error": "SECRET_DOCKER_ERROR"}
RESULT = json.dumps({"id": ID, "name": "/demo", "state": STATE}).encode()


class HostInvestigateTest(unittest.TestCase):
    def test_default_plan_touches_no_docker(self):
        def forbidden(*_args):
            raise AssertionError("Docker was contacted without --probe")
        result = mod.snapshot("demo", False, executor=forbidden, which=forbidden)
        self.assertEqual(result["status"], "NOT_CHECKED")
        self.assertFalse(result["executed"])
        self.assertFalse(result["mutations"])

    def test_reject_shell_and_option_injection_before_probe(self):
        for value in ("--privileged", "name;docker rm -f x", "../container", "", "\n", "hello world"):
            with self.subTest(value=value), self.assertRaises(mod.InvestigationError):
                mod.snapshot(value, False)

    def test_refuses_root_and_missing_cli(self):
        with patch.object(mod.os, "geteuid", return_value=0):
            with self.assertRaisesRegex(mod.InvestigationError, "root"):
                mod.snapshot("demo", True)
        with patch.object(mod.os, "geteuid", return_value=1000):
            with self.assertRaisesRegex(mod.InvestigationError, "not found"):
                mod.snapshot("demo", True, which=lambda _: None)

    def test_reject_remote_cli_context_and_env_override(self):
        calls = []
        def remote(_, *args):
            calls.append(args)
            return b'"tcp://remote.example:2376"'
        with patch.object(mod.os, "geteuid", return_value=1000):
            with self.assertRaisesRegex(mod.InvestigationError, "remote"):
                mod.snapshot("demo", True, executor=remote, which=lambda _: "/usr/bin/docker", environ={})
            self.assertEqual(len(calls), 1)
            calls.clear()
            with self.assertRaisesRegex(mod.InvestigationError, "remote"):
                mod.snapshot("demo", True, executor=remote, which=lambda _: "/usr/bin/docker",
                             environ={"DOCKER_HOST": "tcp://attacker:2375"})
            self.assertEqual(calls, [])

    def test_invalid_context_fails_closed(self):
        for value in (b"invalid", b'null', b'"npipe:////./pipe/docker_engine"'):
            with self.subTest(value=value), patch.object(mod.os, "geteuid", return_value=1000):
                with self.assertRaises(mod.InvestigationError):
                    mod.snapshot("demo", True, executor=lambda *args: value,
                                 which=lambda _: "/usr/bin/docker", environ={})

    def test_scoped_readonly_snapshot_sanitizes_all_logs_and_health_output(self):
        commands = []
        def fake(_, *args):
            commands.append(args)
            if args[0] == "context":
                return b'"unix:///var/run/docker.sock"'
            if args[0] == "inspect":
                return RESULT
            if args[0] == "logs":
                return b"2026-10-15T01:00:00Z connection refused\nPASSWORD=supersecret\n"
            raise AssertionError("unexpected Docker command")
        with patch.object(mod.os, "geteuid", return_value=1000):
            report = mod.snapshot("demo", True, executor=fake, which=lambda _: "/usr/bin/docker",
                                  environ={}, clock=lambda: "2026-10-15T07:00:00Z")
        self.assertEqual(report["status"], "OBSERVED")
        self.assertEqual(report["source"]["containerId"], ID)
        self.assertTrue(report["state"]["oomKilled"])
        self.assertEqual(report["state"]["exitCode"], 137)
        self.assertIn("connection_refused", report["logs"]["signals"])
        self.assertEqual(commands[2][-1], ID, "logs must use resolved container ID")
        self.assertEqual([x[0] for x in commands], ["context", "inspect", "logs"])
        output = json.dumps(report)
        for forbidden in ("supersecret", "PASSWORD", "SENSITIVE SECRET", "SECRET_DOCKER_ERROR"):
            self.assertNotIn(forbidden, output)

    def test_actual_process_output_is_bounded_and_stderr_not_reflected(self):
        with self.assertRaisesRegex(mod.InvestigationError, "capture limit"):
            mod.bounded_command(sys.executable, "-c",
                                "import sys; sys.stdout.buffer.write(b'x' * (3*1024*1024))")
        with self.assertRaisesRegex(mod.InvestigationError, "read-only command failed") as ctx:
            mod.bounded_command(sys.executable, "-c",
                                "import sys; sys.stderr.write('token=ultra-secret'); sys.exit(4)")
        self.assertNotIn("ultra-secret", str(ctx.exception))

    def test_real_log_command_merges_stderr_but_never_exposes_failed_stderr(self):
        with tempfile.TemporaryDirectory() as folder:
            cli = Path(folder) / "fake_docker"
            cli.write_text("#!/usr/bin/env python3\nimport sys\n"
                           "sys.stderr.write('connection refused\\n')\n"
                           "sys.stdout.write('stdout line\\n')\n")
            cli.chmod(0o700)
            output = mod.bounded_command(str(cli), "logs", "--tail", "40", "demo")
            self.assertIn(b"connection refused", output)
            self.assertIn(b"stdout line", output)

    def test_actual_process_times_out_and_is_terminated(self):
        with patch.object(mod, "TIMEOUT_SECONDS", 0.1):
            with self.assertRaisesRegex(mod.InvestigationError, "timed out"):
                mod.bounded_command(sys.executable, "-c", "import time; time.sleep(5)")

    def test_failed_logs_is_partial_never_full_success(self):
        def fake(_, *args):
            if args[0] == "context":
                return b'"unix:///var/run/docker.sock"'
            if args[0] == "inspect":
                return RESULT
            raise mod.InvestigationError("stderr contains secret xyz")
        with patch.object(mod.os, "geteuid", return_value=1000):
            report = mod.snapshot("demo", True, executor=fake,
                                  which=lambda _: "/usr/bin/docker", environ={})
        self.assertEqual(report["status"], "PARTIAL")
        self.assertFalse(report["logs"]["available"])
        self.assertNotIn("xyz", json.dumps(report))

    def test_unrecognized_status_is_rejected_before_reading_logs(self):
        for status in ("TOKEN=secret-value", "RUNNING", "", "exited\\npassword=abc"):
            with self.subTest(status=status):
                calls = []
                def fake(_, *args):
                    calls.append(args[0])
                    if args[0] == "context":
                        return b'"unix:///var/run/docker.sock"'
                    if args[0] == "inspect":
                        state = {**STATE, "Status": status}
                        return json.dumps({"id": ID, "name": "/demo", "state": state}).encode()
                    raise AssertionError("invalid state must not reach log access")
                with patch.object(mod.os, "geteuid", return_value=1000):
                    with self.assertRaisesRegex(mod.InvestigationError, "invalid or incomplete") as ctx:
                        mod.snapshot("demo", True, executor=fake,
                                     which=lambda _: "/usr/bin/docker", environ={})
                self.assertEqual(calls, ["context", "inspect"])
                self.assertNotIn("secret-value", str(ctx.exception))

    def test_timestamps_are_syntactic_dates_not_untrusted_docker_text(self):
        state = {**STATE, "StartedAt": "API_TOKEN=secret-value",
                 "FinishedAt": "2026-99-15T01:00:00Z"}
        def fake(_, *args):
            if args[0] == "context":
                return b'"unix:///var/run/docker.sock"'
            if args[0] == "inspect":
                return json.dumps({"id": ID, "name": "/demo", "state": state}).encode()
            if args[0] == "logs":
                return b"container exited"
            raise AssertionError("unexpected command")
        with patch.object(mod.os, "geteuid", return_value=1000):
            report = mod.snapshot("demo", True, executor=fake,
                                  which=lambda _: "/usr/bin/docker", environ={})
        self.assertEqual(report["status"], "OBSERVED")
        self.assertIsNone(report["state"]["startedAt"])
        self.assertIsNone(report["state"]["finishedAt"])
        self.assertNotIn("secret-value", json.dumps(report))

    def test_docker_rfc3339_nanosecond_timestamp_is_preserved(self):
        state = {**STATE, "StartedAt": "2026-10-15T01:00:00.123456789Z",
                 "FinishedAt": "0001-01-01T00:00:00Z"}
        def fake(_, *args):
            if args[0] == "context":
                return b'"unix:///var/run/docker.sock"'
            if args[0] == "inspect":
                return json.dumps({"id": ID, "name": "/demo", "state": state}).encode()
            return b""
        with patch.object(mod.os, "geteuid", return_value=1000):
            report = mod.snapshot("demo", True, executor=fake,
                                  which=lambda _: "/usr/bin/docker", environ={})
        self.assertEqual(report["state"]["startedAt"], state["StartedAt"])
        self.assertEqual(report["state"]["finishedAt"], state["FinishedAt"])

    def test_invalid_metadata_rejects_before_logs(self):
        calls = []
        def fake(_, *args):
            calls.append(args[0])
            if args[0] == "context":
                return b'"unix:///var/run/docker.sock"'
            return b'{"id":"untrusted", "name":"/demo", "state":{}}'
        with patch.object(mod.os, "geteuid", return_value=1000):
            with self.assertRaisesRegex(mod.InvestigationError, "invalid"):
                mod.snapshot("demo", True, executor=fake,
                             which=lambda _: "/usr/bin/docker", environ={})
        self.assertEqual(calls, ["context", "inspect"])


if __name__ == "__main__":
    unittest.main()
