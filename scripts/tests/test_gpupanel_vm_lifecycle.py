"""Contract tests for the local-only libvirt lifecycle CLI (no KVM required)."""
import importlib.util
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "gpupanel-vm.py"
spec = importlib.util.spec_from_file_location("gpupanel_vm", SCRIPT)
vm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vm)
UUID = "1f1e8ab1-0000-4000-8000-000000000001"
OTHER = "1f1e8ab1-0000-4000-8000-000000000002"


class FakeVirsh:
    def __init__(self):
        self.domains = {UUID: ["personal-vm", "shut off"],
                        OTHER: ["foreign-user-session-vm", "running"]}
        self.calls = []
        self.fail_next = False

    def detail(self, identity):
        identity = vm.valid_uuid(identity)
        if identity not in self.domains:
            raise vm.Refused("not found")
        name, state = self.domains[identity]
        return {"uuid": identity, "name": name, "state": state, "connection": vm.URI}

    def run(self, *args):
        self.calls.append(args)
        if self.fail_next:
            self.fail_next = False
            raise vm.Refused("timeout")
        if args == ("list", "--all", "--uuid"):
            return "\n".join(self.domains)
        cmd, identity = args[:2]
        if cmd == "start":
            self.domains[identity][1] = "running"
        elif cmd == "shutdown":
            self.domains[identity][1] = "shut off"
        elif cmd == "reboot":
            self.domains[identity][1] = "running"
        elif cmd == "undefine":
            del self.domains[identity]
        return ""


class VMManagementTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.api = FakeVirsh()

    def req(self, cmd, identity=UUID, name=None):
        return types.SimpleNamespace(command=cmd, uuid=identity, confirm_name=name)

    def enroll(self):
        return vm.manage(self.api, self.root, self.req("enroll", name="personal-vm"))

    def test_invalid_uuid_refused_before_any_virsh_operation(self):
        with self.assertRaises(vm.Refused):
            vm.manage(self.api, self.root, self.req("start", "--connect=qemu:///system"))
        self.assertEqual(self.api.calls, [])
        with self.assertRaises(vm.Refused):
            vm.valid_uuid("../../some-guest")

    def test_foreign_domain_is_visible_but_not_controllable_without_enrollment(self):
        with self.assertRaisesRegex(vm.Refused, "not explicitly enrolled"):
            vm.manage(self.api, self.root, self.req("shutdown", OTHER))
        self.assertEqual(self.api.calls, [])

    def test_enrollment_needs_exact_name_and_makes_private_record(self):
        with self.assertRaisesRegex(vm.Refused, "Confirmation"):
            vm.manage(self.api, self.root, self.req("enroll", name="not-the-vm"))
        result = self.enroll()
        self.assertTrue(result["enrolled"])
        self.assertEqual((self.root / (UUID + ".json")).stat().st_mode & 0o777, 0o600)
        with self.assertRaisesRegex(vm.Refused, "already enrolled"):
            self.enroll()

    def test_start_shutdown_reboot_check_observed_state_and_name(self):
        self.enroll()
        result = vm.manage(self.api, self.root, self.req("start"))
        self.assertEqual(result["outcome"], "OBSERVED")
        with self.assertRaisesRegex(vm.Refused, "start requires"):
            vm.manage(self.api, self.root, self.req("start"))
        self.assertEqual(vm.manage(self.api, self.root, self.req("reboot"))["outcome"], "PENDING")
        with self.assertRaisesRegex(vm.Refused, "UNKNOWN"):
            vm.manage(self.api, self.root, self.req("shutdown"))
        vm.manage(self.api, self.root, self.req("reconcile"))
        self.assertEqual(vm.manage(self.api, self.root, self.req("shutdown"))["state"], "shut off")
        self.api.domains[UUID][0] = "changed-behind-our-back"
        with self.assertRaisesRegex(vm.Refused, "name changed"):
            vm.manage(self.api, self.root, self.req("start"))

    def test_failed_command_is_unknown_not_safely_retriable(self):
        self.enroll()
        self.api.fail_next = True
        with self.assertRaisesRegex(vm.Refused, "UNKNOWN"):
            vm.manage(self.api, self.root, self.req("start"))
        self.assertTrue(vm.unresolved(self.root, UUID))
        with self.assertRaisesRegex(vm.Refused, "UNKNOWN"):
            vm.manage(self.api, self.root, self.req("start"))
        self.assertEqual(len(self.api.calls), 1)
        observed = vm.manage(self.api, self.root, self.req("reconcile"))
        self.assertTrue(observed["reconciled"])
        self.assertFalse(vm.unresolved(self.root, UUID))

    def test_delete_requires_stopped_and_exact_name_no_storage_delete(self):
        self.enroll()
        with self.assertRaisesRegex(vm.Refused, "Deletion requires"):
            vm.manage(self.api, self.root, self.req("delete", name="wrong"))
        result = vm.manage(self.api, self.root, self.req("delete", name="personal-vm"))
        self.assertEqual(result["outcome"], "OBSERVED")
        self.assertFalse((self.root / (UUID + ".json")).exists())
        self.assertIn(("undefine", UUID, "--keep-nvram"), self.api.calls)
        self.assertNotIn(UUID, self.api.domains)
        self.assertFalse(any("storage" in str(c) or "wipe" in str(c) for c in self.api.calls))

    def test_operation_journal_rejects_symlink(self):
        self.enroll()
        secret = self.root / "private-data"
        secret.write_text("must remain")
        (self.root / "operations.jsonl").symlink_to(secret)
        with self.assertRaises(OSError):
            vm.manage(self.api, self.root, self.req("start"))
        self.assertEqual(secret.read_text(), "must remain")
        self.assertEqual(self.api.calls, [])

    def test_explicit_connection_is_never_derived_from_environment(self):
        with patch.object(vm.subprocess, "run") as run:
            run.return_value.returncode = 0
            run.return_value.stdout = "qemu:///session\n"
            virsh = vm.Virsh("/usr/bin/virsh")
            with patch.dict(vm.os.environ, {"LIBVIRT_DEFAULT_URI": "qemu+ssh://danger/system"}):
                virsh.run("uri")
            argv = run.call_args.args[0]
            self.assertEqual(argv, ["/usr/bin/virsh", "--connect", "qemu:///session", "uri"])
            self.assertEqual(run.call_args.kwargs["env"]["LIBVIRT_DEFAULT_URI"], vm.URI)


if __name__ == "__main__":
    unittest.main()
