"""Read-only project discovery with real receipts, drift and abuse controls."""
from __future__ import annotations

import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location(
    "gpupanel_project_inventory_test", ROOT / "scripts/gpupanel-project-inventory.py"
)
inventory_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory_mod)


class ProjectInventoryTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.home = Path(temp.name)
        self.projects = self.home / "GPUPanel" / "projects"

    def fake_uv_project(self, name="my-uv-project"):
        target = self.projects / name
        target.mkdir(parents=True)
        for name_, contents in {
            "README.md": "# User project\n",
            "main.py": "print('hello')\n",
            "pyproject.toml": '[project]\nname = "gpupanel-starter"\nversion = "0.1.0"\ndependencies = []\n',
            "uv.lock": 'version = 1\n[[package]]\nname = "gpupanel-starter"\nversion = "0.1.0"\n',
        }.items():
            (target / name_).write_text(contents)
        files = {name_: hashlib.sha256((target / name_).read_bytes()).hexdigest()
                 for name_ in inventory_mod.uv.FILES}
        (target / inventory_mod.uv.RECEIPT).write_text(json.dumps({
            "formatVersion": 1, "target": str(target),
            "planDigest": "a" * 64, "files": files,
        }))
        return target

    def test_empty_and_unmanaged_dirs_never_disclosed(self):
        self.assertEqual(inventory_mod.inventory(self.projects, self.home)["projects"], [])
        hidden = self.projects / "private-notebook"
        hidden.mkdir(parents=True)
        (hidden / "credentials.txt").write_text("DO_NOT_DISCLOSE")
        result = inventory_mod.inventory(self.projects, self.home)
        self.assertEqual(result["projects"], [])
        self.assertNotIn("credentials", str(result))
        self.assertEqual((hidden / "credentials.txt").read_text(), "DO_NOT_DISCLOSE")

    def test_recognizes_real_receipt_and_preserves_user_modified_project(self):
        target = self.fake_uv_project()
        before = inventory_mod.inventory(self.projects, self.home)
        self.assertEqual(before["projects"], [
            {"directory": target.name, "source": "uv", "state": "VERIFIED"}])
        self.assertEqual(before["verified"], 1)
        (target / "main.py").write_text("print('my own notebook code')\n")
        after = inventory_mod.inventory(self.projects, self.home)
        self.assertEqual(after["projects"][0]["state"], "MODIFIED")
        self.assertEqual(after["needsReview"], 1)
        self.assertIn("my own notebook code", (target / "main.py").read_text())

    def test_catalog_installer_receipt_is_discovered_without_exec(self):
        target = self.projects / "reviewed-catalog"
        result = inventory_mod.catalog.install(target, self.home, True)
        self.assertEqual(result["status"], "INSTALLED")
        found = inventory_mod.inventory(self.projects, self.home)
        self.assertEqual(found["projects"], [
            {"directory": target.name, "source": "catalog", "state": "INSTALLED"}])
        (target / "main.py").write_text("print('user modification')\n")
        found = inventory_mod.inventory(self.projects, self.home)
        self.assertEqual(found["projects"][0]["state"], "DRIFT")
        self.assertIn("user modification", (target / "main.py").read_text())

    def test_duplicate_receipts_are_conflict_not_authoritative(self):
        target = self.fake_uv_project()
        (target / inventory_mod.catalog.RECEIPT).write_text("{}")
        result = inventory_mod.inventory(self.projects, self.home)
        self.assertEqual(result["projects"][0]["source"], "conflict")
        self.assertEqual(result["projects"][0]["state"], "CONFLICT")
        self.assertEqual(result["verified"], 0)

    def test_skips_symlinked_projects_and_rejects_symlinked_roots(self):
        outside = self.home / "private"
        outside.mkdir()
        (outside / "secret.txt").write_text("NEVER_READ")
        self.projects.mkdir(parents=True)
        (self.projects / "linked").symlink_to(outside, target_is_directory=True)
        self.assertEqual(inventory_mod.inventory(self.projects, self.home)["projects"], [])
        link_root = self.home / "other-projects"
        link_root.symlink_to(self.projects, target_is_directory=True)
        with self.assertRaises(inventory_mod.InventoryError):
            inventory_mod.inventory(link_root, self.home)
        self.assertEqual((outside / "secret.txt").read_text(), "NEVER_READ")

    def test_large_catalog_file_refused_before_unbounded_hash(self):
        target = self.projects / "large-catalog"
        target.mkdir(parents=True)
        (target / inventory_mod.catalog.RECEIPT).write_text("{}")
        (target / "main.py").write_bytes(b"x" * (inventory_mod.MAX_SOURCE_FILE + 1))
        found = inventory_mod.inventory(self.projects, self.home)
        self.assertEqual(found["projects"][0]["state"], "DRIFT")

    def test_bounded_inventory_fails_closed_without_partial_output(self):
        self.projects.mkdir(parents=True)
        for i in range(inventory_mod.LIMIT + 1):
            (self.projects / ("dir-" + str(i))).mkdir()
        with self.assertRaisesRegex(inventory_mod.InventoryError, "limit exceeded"):
            inventory_mod.inventory(self.projects, self.home)

    def test_human_and_machine_cli_are_read_only(self):
        self.fake_uv_project("project-a")
        with patch.object(inventory_mod.Path, "home", return_value=self.home), \
                patch.object(inventory_mod.os, "geteuid", return_value=1000):
            rendered = io.StringIO()
            with contextlib.redirect_stdout(rendered):
                code = inventory_mod.main(["list", "--projects-dir", str(self.projects), "--json"])
            self.assertEqual(code, 0)
            result = json.loads(rendered.getvalue())
            self.assertEqual(result["projects"][0]["state"], "VERIFIED")
            human = io.StringIO()
            with contextlib.redirect_stdout(human):
                code = inventory_mod.main(["list", "--projects-dir", str(self.projects)])
            self.assertEqual(code, 0)
            self.assertIn("只读", human.getvalue())
        with patch.object(inventory_mod.os, "geteuid", return_value=0):
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(inventory_mod.main(["list", "--projects-dir", str(self.projects)]), 2)


if __name__ == "__main__":
    unittest.main()
