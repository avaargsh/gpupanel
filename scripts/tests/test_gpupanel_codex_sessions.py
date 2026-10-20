"""Codex rollout inventory: only local owner metadata, never prompts or commands."""
from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/gpupanel-codex-sessions.py"
spec = importlib.util.spec_from_file_location("codex_sessions_inventory", SCRIPT)
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)

SESSION_A = "123e4567-e89b-12d3-a456-426614174000"
SESSION_B = "123e4567-e89b-12d3-a456-426614174001"


class CodexInventoryTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.home = Path(temp.name) / "ubuntu"
        self.home.mkdir(mode=0o700)
        self.uid = os.getuid()
        self.day = self.home / ".codex" / "sessions" / "2026" / "10" / "20"
        self.day.mkdir(parents=True)
        for directory in [self.home / ".codex", self.home / ".codex" / "sessions",
                          self.home / ".codex" / "sessions" / "2026",
                          self.home / ".codex" / "sessions" / "2026" / "10", self.day]:
            directory.chmod(0o700)

    def rollout(self, sid=SESSION_A, *, cwd="/home/ubuntu/my-project",
                first_type="session_meta", payload=None, suffix="a"):
        path = self.day / ("rollout-2026-10-20T10-00-00-" + suffix + ".jsonl")
        metadata = {
            "timestamp": "2026-10-20T10:00:00.000Z",
            "type": first_type,
            "payload": payload if payload is not None else {"id": sid, "cwd": cwd},
        }
        path.write_text(json.dumps(metadata) + "\n" +
                        json.dumps({"type": "response_item",
                                    "payload": {"content": "SECRET_PROMPT_DO_NOT_EXPORT"}}))
        return path

    def test_owner_only_metadata_and_no_sensitive_payload(self):
        self.rollout()
        result = inventory.scan(self.home, self.uid)
        self.assertEqual(result["schemaVersion"], 1)
        self.assertTrue(result["readOnly"])
        self.assertFalse(result["liveStatusVerified"])
        self.assertEqual(result["sessions"], [{
            "sessionId": SESSION_A, "runtimeKind": "codex",
            "projectLabel": "my-project",
            "startedAt": "2026-10-20T10:00:00.000Z", "liveness": "unknown",
        }])
        self.assertNotIn("SECRET_PROMPT", json.dumps(result))
        self.assertNotIn("/home/ubuntu", json.dumps(result))

    def test_rejects_symlinked_archive_and_first_line(self):
        outside = self.home / "private"
        outside.write_text("SENSITIVE")
        (self.day / "rollout-linked.jsonl").symlink_to(outside)
        self.assertEqual(inventory.scan(self.home, self.uid)["sessions"], [])
        self.rollout()
        self.assertEqual(len(inventory.scan(self.home, self.uid)["sessions"]), 1)
        (self.home / ".codex" / "sessions").rename(self.home / ".codex" / "original")
        (self.home / ".codex" / "sessions").symlink_to(self.home / ".codex" / "original")
        with self.assertRaises(inventory.InventoryUnavailable):
            inventory.scan(self.home, self.uid)

    def test_directory_swap_cannot_redirect_open_archive_walk(self):
        self.rollout(sid=SESSION_A)
        outside = self.home / "outside"
        outside.mkdir(mode=0o700)
        outside_rollout = outside / "rollout-outside.jsonl"
        outside_rollout.write_text(json.dumps({
            "timestamp": "2026-10-20T11:00:00.000Z",
            "type": "session_meta",
            "payload": {"id": SESSION_B, "cwd": "/home/ubuntu/secret"},
        }) + "\\n")
        original_day = self.home / "day-original"
        day_inode = self.day.stat().st_ino
        real_listdir = os.listdir
        swapped = False

        def swap_path_after_open(directory):
            nonlocal swapped
            if (not swapped and isinstance(directory, int)
                    and os.fstat(directory).st_ino == day_inode):
                swapped = True
                self.day.rename(original_day)
                self.day.symlink_to(outside, target_is_directory=True)
            return real_listdir(directory)

        with patch.object(inventory.os, "listdir", side_effect=swap_path_after_open):
            result = inventory.scan(self.home, self.uid)

        self.assertTrue(swapped)
        self.assertEqual([row["sessionId"] for row in result["sessions"]], [SESSION_A])
        self.assertNotIn("secret", json.dumps(result))

    def test_rejects_malformed_uuid_and_huge_first_line(self):
        self.rollout(sid="not-a-uuid")
        self.assertEqual(inventory.scan(self.home, self.uid)["sessions"], [])
        self.rollout(payload={"id": SESSION_A, "cwd": "x" * 30_000}, suffix="b")
        self.assertEqual(inventory.scan(self.home, self.uid)["sessions"], [])

    def test_no_inference_of_liveness_or_workspace_binding(self):
        self.rollout(cwd="/root/hidden", suffix="a")
        self.rollout(sid=SESSION_B, cwd="relative", suffix="b")
        result = inventory.scan(self.home, self.uid)
        self.assertEqual(len(result["sessions"]), 2)
        self.assertTrue(all(row["liveness"] == "unknown" for row in result["sessions"]))
        self.assertNotIn("/root", str(result))

    def test_bounded_archive_never_returns_partial_success(self):
        self.rollout()
        with patch.object(inventory, "MAX_FILES", 1):
            (self.day / "rollout-a-second.jsonl").write_text("{}")
            with self.assertRaisesRegex(inventory.InventoryUnavailable, "too many"):
                inventory.scan(self.home, self.uid)

    def test_owner_and_directory_permission_fences(self):
        self.rollout()
        with self.assertRaises(inventory.InventoryUnavailable):
            inventory.scan(self.home, self.uid + 1)
        (self.home / ".codex").chmod(0o777)
        with self.assertRaises(inventory.InventoryUnavailable):
            inventory.scan(self.home, self.uid)

    def test_empty_archive_and_refuse_root_cli(self):
        (self.home / ".codex" / "sessions").rename(self.home / ".codex" / "elsewhere")
        self.assertEqual(inventory.scan(self.home, self.uid)["sessions"], [])
        with patch.object(inventory.os, "geteuid", return_value=0):
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(inventory.main(["list"]), 2)


if __name__ == "__main__":
    unittest.main()
