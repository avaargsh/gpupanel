import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("gpupanel_docker_smoke", ROOT / "scripts/gpupanel-docker-smoke.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
IMAGE = "docker.io/library/busybox@sha256:" + "a"*64


def inspected_result(args):
    if args[0] == "inspect" and "Labels" in args[2]:
        return args[-1].removeprefix("gpupanel-accept-")
    return "0"


class DockerSmokeContract(unittest.TestCase):
    def test_plan_does_not_call_docker(self):
        def forbidden(*args):
            raise AssertionError("Docker CLI called before approval")
        result = mod.smoke(IMAGE, False, executor=forbidden)
        self.assertEqual(result["status"], "APPROVAL_REQUIRED")
        self.assertFalse(result["executed"])

    def test_reject_mutable_or_shell_injected_image(self):
        for image in ("busybox:latest", "busybox", IMAGE + ";echo x", "https://example.com/a",
                      "docker.io/library/busybox@sha256:BAD"):
            with self.assertRaises(mod.SmokeError):
                mod.smoke(image, False)

    def test_approved_lifecycle_no_pull_and_cleanup(self):
        commands = []
        def fake(_binary, *args):
            commands.append(args)
            if args[0] == "logs":
                return mod.MARKER
            if args[0] == "inspect":
                return inspected_result(args)
            return "ok"
        with patch.object(mod.os, "geteuid", return_value=1000), \
             patch.object(mod.shutil, "which", return_value="/usr/bin/docker"):
            result = mod.smoke(IMAGE, True, executor=fake)
        self.assertEqual(result["status"], "PASSED")
        self.assertTrue(result["containerRemoved"])
        create = next(args for args in commands if args[0] == "create")
        for flag in ("--pull=never", "--network=none", "--read-only", "--cap-drop=ALL",
                     "--security-opt", "no-new-privileges", "--entrypoint"):
            self.assertIn(flag, create)
        self.assertNotIn("-v", create)
        self.assertNotIn("--privileged", create)
        self.assertNotIn("pull", [x[0] for x in commands])
        self.assertEqual(commands[-1][0:2], ("rm", "-f"))

    def test_failed_logs_cleanup_still_required(self):
        commands = []
        def fake(_binary, *args):
            commands.append(args)
            if args[0] == "logs":
                raise mod.SmokeError("failed")
            if args[0] == "inspect":
                return inspected_result(args)
            return "ok"
        with patch.object(mod.os, "geteuid", return_value=1000), \
             patch.object(mod.shutil, "which", return_value="/usr/bin/docker"):
            with self.assertRaises(mod.SmokeError):
                mod.smoke(IMAGE, True, executor=fake)
        self.assertEqual(commands[-1][0], "rm")

    def test_local_image_id_contract(self):
        local = "sha256:" + "b" * 64
        called = []
        def fake(_binary, *args):
            called.append(args)
            if args[0] == "image":
                return local
            if args[0] == "logs":
                return mod.MARKER
            if args[0] == "inspect":
                return inspected_result(args)
            return "ok"
        self.assertEqual(mod.smoke(local, False, fixture_entrypoint=True)["status"], "APPROVAL_REQUIRED")
        with patch.object(mod.os, "geteuid", return_value=1000), \
             patch.object(mod.shutil, "which", return_value="/usr/bin/docker"):
            result = mod.smoke(local, True, executor=fake, fixture_entrypoint=True)
        self.assertEqual(result["status"], "PASSED")
        create = next(x for x in called if x[0] == "create")
        self.assertIn("/gpupanel-smoke", create)
        self.assertNotIn("/bin/sh", create)
        self.assertNotIn("-v", create)
        self.assertEqual(called[-1][:2], ("rm", "-f"))
        with self.assertRaises(mod.SmokeError):
            mod.smoke(IMAGE, False, fixture_entrypoint=True)

    def test_local_image_id_mismatch_fails_before_create(self):
        local = "sha256:" + "b" * 64
        def bad(_binary, *args):
            if args[0] == "image":
                return "sha256:" + "a" * 64
            return "ok"
        with patch.object(mod.os, "geteuid", return_value=1000), \
             patch.object(mod.shutil, "which", return_value="/usr/bin/docker"):
            with self.assertRaisesRegex(mod.SmokeError, "did not match"):
                mod.smoke(local, True, executor=bad, fixture_entrypoint=True)

    def test_create_ack_lost_after_daemon_commits_container_still_removed(self):
        calls = []
        def fake(_binary, *args):
            calls.append(args)
            if args[0] == "create":
                raise mod.SmokeError("create response lost")
            if args[0] == "inspect":
                return inspected_result(args)
            return "ok"
        with patch.object(mod.os, "geteuid", return_value=1000), \
             patch.object(mod.shutil, "which", return_value="/usr/bin/docker"):
            with self.assertRaisesRegex(mod.SmokeError, "create response lost"):
                mod.smoke(IMAGE, True, executor=fake)
        self.assertEqual(calls[-1][:2], ("rm", "-f"))
        self.assertIn("--label", next(x for x in calls if x[0] == "create"))

    def test_foreign_container_name_collision_never_deleted(self):
        calls = []
        def fake(_binary, *args):
            calls.append(args)
            if args[0] == "create":
                raise mod.SmokeError("name collision")
            if args[0] == "inspect" and "Labels" in args[2]:
                return "foreign-owner"
            return "ok"
        with patch.object(mod.os, "geteuid", return_value=1000), \
             patch.object(mod.shutil, "which", return_value="/usr/bin/docker"):
            with self.assertRaisesRegex(mod.SmokeError, "ownership unverified"):
                mod.smoke(IMAGE, True, executor=fake)
        self.assertNotIn("rm", [args[0] for args in calls])

    def test_refuse_root_before_docker_access(self):
        with patch.object(mod.os, "geteuid", return_value=0):
            with self.assertRaises(mod.SmokeError):
                mod.smoke(IMAGE, True)

    def test_cleanup_failure_not_reported_as_success(self):
        def fake(_binary, *args):
            if args[0] == "rm":
                raise mod.SmokeError("cleanup failed")
            if args[0] == "logs":
                return mod.MARKER
            if args[0] == "inspect":
                return inspected_result(args)
            return "ok"
        with patch.object(mod.os, "geteuid", return_value=1000), \
             patch.object(mod.shutil, "which", return_value="/usr/bin/docker"):
            with self.assertRaisesRegex(mod.SmokeError, "cleanup"):
                mod.smoke(IMAGE, True, executor=fake)


if __name__ == "__main__":
    unittest.main()
