"""Regression tests for the pre-install rollback inventory oracle."""
import importlib.util
from pathlib import Path
import sys
import tempfile
import hashlib
from unittest import mock
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/install-test"))
spec = importlib.util.spec_from_file_location(
    "gpupanel_preinstall_rollback", ROOT / "scripts/install-test/preinstall-rollback-live.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PreinstallRollbackInventoryTests(unittest.TestCase):
    def setUp(self):
        self.before = {
            "containers": [],
            "networks": [
                "id-bridge-a|bridge|bridge|local",
                "id-host|host|host|local",
                "id-none|none|null|local",
                "id-custom|project_default|bridge|local",
            ],
            "volumes": [],
            "images": [],
        }

    def test_default_bridge_id_rotation_is_the_only_normalized_network_change(self):
        after = {**self.before, "networks": [
            "id-bridge-b|bridge|bridge|local",
            "id-host|host|host|local",
            "id-none|none|null|local",
            "id-custom|project_default|bridge|local",
        ]}
        self.assertEqual(module.inventory_digests(self.before),
                         module.inventory_digests(after))

    def test_custom_network_identity_membership_driver_and_scope_remain_strict(self):
        cases = (
            ["id-bridge-b|bridge|bridge|local", "id-host|host|host|local",
             "id-none|none|null|local", "id-custom-2|project_default|bridge|local"],
            ["id-bridge-b|bridge|bridge|local", "id-host|host|host|local",
             "id-none|none|null|local"],
            ["id-bridge-b|bridge|bridge|local", "id-host|host|host|local",
             "id-none|none|null|local", "id-custom|project_default|overlay|local"],
            ["id-bridge-b|bridge|bridge|local", "id-host|host|host|local",
             "id-none|none|null|local", "id-custom|project_default|bridge|global"],
        )
        baseline = module.inventory_digests(self.before)["networks"]
        for networks in cases:
            with self.subTest(networks=networks[-1]):
                changed = {**self.before, "networks": networks}
                self.assertNotEqual(module.inventory_digests(changed)["networks"], baseline)

    def test_malformed_or_duplicate_network_names_fail_closed(self):
        for networks in (
            ["private"],
            ["id-bridge|bridge|bridge|local", "other-id|bridge|bridge|local"],
            ["|bridge|bridge|local"],
        ):
            with self.subTest(networks=networks):
                with self.assertRaises(ValueError):
                    module.inventory_digests({**self.before, "networks": networks})



class AtomicDiskHandoffTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.disk = self.root / "disk.qcow2"
        self.previous = self.root / "disk.previous.qcow2"
        self.partial = self.root / "disk.partial"
        self.original = b"previous active disk bytes"
        self.restored = b"sealed checkpoint bytes"
        self.expected = hashlib.sha256(self.restored).hexdigest()

    def test_atomic_replace_keeps_previous_disk_and_is_idempotent(self):
        self.disk.write_bytes(self.original)
        self.partial.write_bytes(self.restored)
        self.assertEqual(module.disk_handoff.atomic_disk_handoff(
            self.disk, self.previous, self.partial, self.expected), self.expected)
        self.assertEqual(self.disk.read_bytes(), self.restored)
        self.assertEqual(self.previous.read_bytes(), self.original)
        self.assertFalse(self.disk.samefile(self.previous))
        self.assertFalse(self.partial.exists())
        self.assertEqual(module.disk_handoff.atomic_disk_handoff(
            self.disk, self.previous, self.partial, self.expected), self.expected)

    def test_interruption_before_replace_keeps_active_path_and_retry_completes(self):
        self.disk.write_bytes(self.original)
        self.partial.write_bytes(self.restored)
        with mock.patch.object(module.disk_handoff.os, "replace",
                               side_effect=OSError("simulated interruption")):
            with self.assertRaises(OSError):
                module.disk_handoff.atomic_disk_handoff(
                    self.disk, self.previous, self.partial, self.expected)
        self.assertTrue(self.disk.is_file())
        self.assertEqual(self.disk.read_bytes(), self.original)
        self.assertTrue(self.disk.samefile(self.previous))
        self.assertEqual(self.partial.read_bytes(), self.restored)
        module.disk_handoff.atomic_disk_handoff(
            self.disk, self.previous, self.partial, self.expected)
        self.assertEqual(self.disk.read_bytes(), self.restored)
        self.assertEqual(self.previous.read_bytes(), self.original)

    def test_recovers_old_missing_active_path_intermediate_state(self):
        self.previous.write_bytes(self.original)
        self.partial.write_bytes(self.restored)
        module.disk_handoff.atomic_disk_handoff(
            self.disk, self.previous, self.partial, self.expected)
        self.assertEqual(self.disk.read_bytes(), self.restored)
        self.assertEqual(self.previous.read_bytes(), self.original)

    def test_refuses_ambiguous_existing_disk_without_overwrite(self):
        self.disk.write_bytes(b"unrelated active disk")
        self.previous.write_bytes(self.original)
        self.partial.write_bytes(self.restored)
        with self.assertRaises(RuntimeError):
            module.disk_handoff.atomic_disk_handoff(
                self.disk, self.previous, self.partial, self.expected)
        self.assertEqual(self.disk.read_bytes(), b"unrelated active disk")


if __name__ == "__main__":
    unittest.main()
