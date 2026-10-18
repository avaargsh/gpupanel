"""Synthetic checkpoint contract; NEVER launches QEMU or touches the host."""
from __future__ import annotations

import fcntl
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / "scripts/install-test"
sys.path.insert(0, str(TOOLS))
import checkpoint
import vm


class OfflineCheckpointContracts(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.state = root / "owned-vm"
        self.cache = root / "cache"
        self.state.mkdir()
        self.cache.mkdir()
        self.image_name = "pinned-base.img"
        self.source_url = "https://example.invalid/pinned-base.img"
        self.base = self.cache / self.image_name
        self.base.write_bytes(b"PINNED_BASE_IMAGE")
        self.digest = hashlib.sha256(self.base.read_bytes()).hexdigest()
        self.overlay = self.state / "disk.qcow2"
        self.overlay.write_bytes(b"FAKE_OVERLAY")
        (self.state / "image-provenance.json").write_text(json.dumps({
            "url": self.source_url,
            "sha256": self.digest,
            "signed_checksum_verified": True,
            "purpose": "disposable-install-test",
        }))
        self.commands = []
        self.overlay_backing = str(self.base)
        self.checkpoint_backing = None

    def qemu(self, argv, **kwargs):
        self.commands.append((argv, kwargs))
        if argv[:2] == ["qemu-img", "info"]:
            target = Path(argv[-1])
            is_source = target == self.overlay
            payload = {"format": "qcow2", "virtual-size": checkpoint.VIRTUAL_SIZE}
            backing = self.overlay_backing if is_source else self.checkpoint_backing
            if backing is not None:
                payload["full-backing-filename"] = backing
            return subprocess.CompletedProcess(argv, 0, stdout=json.dumps(payload))
        if argv[:2] == ["qemu-img", "convert"]:
            self.assertEqual(argv[2], "-O")
            self.assertEqual(argv[3], "qcow2")
            self.assertEqual(Path(argv[4]), self.overlay)
            Path(argv[5]).write_bytes(b"INDEPENDENT_STANDALONE_IMAGE")
            return subprocess.CompletedProcess(argv, 0)
        self.fail("unexpected QEMU invocation")

    def create(self, is_running=lambda: False):
        return checkpoint.create_checkpoint(
            self.state, self.cache, self.image_name, self.digest, self.source_url,
            is_running=is_running, command=self.qemu,
        )

    def test_seals_independent_qcow2_and_verifies_digest_without_restoring(self):
        folder = self.create()
        info = checkpoint.verify_checkpoint(folder, command=self.qemu)
        self.assertEqual(info["schema"], checkpoint.SCHEMA)
        self.assertEqual(info["source_image_sha256"], self.digest)
        self.assertFalse(info["restoration_tested"])
        self.assertFalse(info["installation_approved"])
        self.assertEqual(info["disk_sha256"], hashlib.sha256(b"INDEPENDENT_STANDALONE_IMAGE").hexdigest())
        self.assertEqual(sum(1 for args, _ in self.commands if args[1] == "convert"), 1)
        self.assertTrue(folder.name.startswith("checkpoint-"))
        self.assertNotEqual(folder / "disk.qcow2", self.overlay)

    def test_running_vm_is_rejected_before_disk_read_or_qemu(self):
        with self.assertRaisesRegex(RuntimeError, "running"):
            self.create(lambda: True)
        self.assertFalse(self.commands)
        self.assertFalse((self.state / "checkpoints").exists())

    def test_wrong_base_digest_and_untrusted_provenance_are_denied(self):
        self.base.write_bytes(b"CHANGED")
        with self.assertRaisesRegex(RuntimeError, "digest"):
            self.create()
        self.base.write_bytes(b"PINNED_BASE_IMAGE")
        (self.state / "image-provenance.json").write_text(json.dumps({
            "url": self.source_url, "sha256": self.digest,
            "signed_checksum_verified": False, "purpose": "disposable-install-test",
        }))
        with self.assertRaisesRegex(RuntimeError, "provenance"):
            self.create()
        self.assertFalse(self.commands)

    def test_redirected_overlay_and_wrong_backing_are_denied(self):
        self.overlay.unlink()
        self.overlay.symlink_to(self.base)
        with self.assertRaisesRegex(RuntimeError, "not a regular file"):
            self.create()
        self.assertFalse(self.commands)
        self.overlay.unlink()
        self.overlay.write_bytes(b"OVERLAY")
        self.overlay_backing = "/unknown/outside/pinned-base.img"
        with self.assertRaisesRegex(RuntimeError, "pinned base"):
            self.create()
        self.assertFalse((self.state / "checkpoints").exists())

    def test_incomplete_or_backed_conversion_never_seals_a_checkpoint(self):
        self.checkpoint_backing = str(self.base)
        with self.assertRaisesRegex(RuntimeError, "standalone"):
            self.create()
        parent = self.state / "checkpoints"
        entries = list(parent.iterdir())
        self.assertEqual(len(entries), 1)
        self.assertFalse((entries[0] / "checkpoint.json").exists())

    def test_snapshot_changed_after_seal_is_refused(self):
        folder = self.create()
        (folder / "disk.qcow2").write_bytes(b"TAMPERED")
        with self.assertRaisesRegex(RuntimeError, "digest mismatch"):
            checkpoint.verify_checkpoint(folder, command=self.qemu)

    def test_manifest_cannot_claim_restoration_or_install_approval(self):
        folder = self.create()
        path = folder / "checkpoint.json"
        original = json.loads(path.read_text())
        for changed in (
            {"restoration_tested": True},
            {"installation_approved": True},
            {"scope": "other-vm"},
            {"untrusted_metadata": "SECRET_PAYLOAD"},
        ):
            with self.subTest(changed=changed):
                path.write_text(json.dumps({**original, **changed}))
                with self.assertRaisesRegex(RuntimeError, "identity or digest"):
                    checkpoint.verify_checkpoint(folder, command=self.qemu)
        path.write_text(json.dumps(original))
        self.assertEqual(checkpoint.verify_checkpoint(folder, command=self.qemu)["disk"], "disk.qcow2")

    def test_untrusted_checkpoint_name_and_symlinked_manifest_are_rejected(self):
        folder = self.create()
        with self.assertRaisesRegex(RuntimeError, "unrecognized checkpoint name"):
            checkpoint.verify_checkpoint(folder.parent / "../outside", command=self.qemu)
        meta = folder / "checkpoint.json"
        copy = folder / "forbidden"
        copy.write_bytes(meta.read_bytes())
        meta.unlink()
        meta.symlink_to(copy)
        with self.assertRaisesRegex(RuntimeError, "regular file"):
            checkpoint.verify_checkpoint(folder, command=self.qemu)

    def test_owner_lock_rejects_redirection_and_parallel_start(self):
        original = vm.STATE
        vm.STATE = self.state
        self.addCleanup(setattr, vm, "STATE", original)
        executed = []
        lock = self.state / ".vm-owner.lock"
        lock.symlink_to(self.base)
        with self.assertRaises(OSError):
            vm.guarded_vm_change(lambda: executed.append(True))
        lock.unlink()
        with lock.open("w+") as held:
            fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaisesRegex(RuntimeError, "another owned VM operation"):
                vm.guarded_vm_change(lambda: executed.append(True))
        self.assertFalse(executed)
        vm.guarded_vm_change(lambda: executed.append(True))
        self.assertEqual(executed, [True])


if __name__ == "__main__":
    unittest.main()
