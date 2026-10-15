"""Real local workspace create/reconcile/uninstall; no network, root or Docker required."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location("gpupanel_catalog_workspace",ROOT/"scripts/gpupanel-catalog-workspace.py")
workspace=importlib.util.module_from_spec(spec)
spec.loader.exec_module(workspace)

class WorkspaceGoldenPath(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home=Path(self.temp.name)
        self.parent=self.home/"projects"
        self.parent.mkdir()
        self.dst=self.parent/"hello-world"

    def test_catalog_contains_real_approved_revision(self):
        idx, rev, files=workspace.verified_template()
        self.assertEqual(rev["id"],workspace.catalog.revision_digest(rev))
        self.assertEqual(set(files),set(workspace.FILES))
        self.assertEqual(idx["definitions"][-1]["status"],"experimental")
        self.assertEqual(workspace.catalog.plan(idx,workspace.DEFINITION_ID)["status"],"READY_FOR_USER_APPROVAL")

    def test_offline_authorized_lifecycle(self):
        self.assertEqual(workspace.install(self.dst,self.home,False)["status"],"APPROVAL_REQUIRED")
        self.assertFalse(self.dst.exists())
        result=workspace.install(self.dst,self.home,True)
        self.assertEqual(result["status"],"INSTALLED")
        self.assertEqual(workspace.status(self.dst,self.home)["status"],"INSTALLED")
        with self.assertRaises(workspace.WorkspaceError):
            workspace.install(self.dst,self.home,True)
        self.assertEqual(workspace.uninstall(self.dst,self.home,False)["status"],"APPROVAL_REQUIRED")
        self.assertTrue(self.dst.is_dir())
        self.assertEqual(workspace.uninstall(self.dst,self.home,True)["status"],"ABSENT")
        self.assertFalse(self.dst.exists())

    def test_default_like_nested_install_creates_private_parents_only_after_approval(self):
        dst = self.home / "GPUPanel" / "projects" / "python-stdlib-starter"
        plan = workspace.install(dst, self.home, False)
        self.assertEqual(plan["status"], "APPROVAL_REQUIRED")
        self.assertFalse((self.home / "GPUPanel").exists())
        self.assertEqual(workspace.status(dst, self.home)["status"], "ABSENT")
        result = workspace.install(dst, self.home, True)
        self.assertEqual(result["status"], "INSTALLED")
        self.assertEqual((self.home / "GPUPanel").stat().st_mode & 0o777, 0o700)
        self.assertEqual((self.home / "GPUPanel" / "projects").stat().st_mode & 0o777, 0o700)
        self.assertEqual(workspace.uninstall(dst, self.home, True)["status"], "ABSENT")
        # Parent folders are left intact: we cannot assume they have no user content.
        self.assertTrue((self.home / "GPUPanel" / "projects").is_dir())

    def test_missing_parent_symlink_rejected_without_effect(self):
        external = self.home.parent / (self.home.name + "-external")
        with tempfile.TemporaryDirectory(dir=self.home.parent) as td:
            (self.home / "redirect").symlink_to(Path(td), target_is_directory=True)
            with self.assertRaises(workspace.WorkspaceError):
                workspace.install(self.home / "redirect" / "new" / "project", self.home, True)
            self.assertFalse((Path(td) / "new").exists())

    def test_no_overwrite_existing_user_work(self):
        self.dst.mkdir()
        (self.dst/"important.txt").write_text("do not touch")
        with self.assertRaises(workspace.WorkspaceError):
            workspace.install(self.dst,self.home,True)
        self.assertEqual((self.dst/"important.txt").read_text(),"do not touch")

    def test_tamper_blocks_removal(self):
        workspace.install(self.dst,self.home,True)
        (self.dst/"main.py").write_text("changed!")
        self.assertEqual(workspace.status(self.dst,self.home)["status"],"DRIFT")
        with self.assertRaises(workspace.WorkspaceError):
            workspace.uninstall(self.dst,self.home,True)
        self.assertTrue((self.dst/"main.py").exists())

    def test_extra_file_blocks_removal(self):
        workspace.install(self.dst,self.home,True)
        (self.dst/"my-notes.md").write_text("user data")
        self.assertEqual(workspace.status(self.dst,self.home)["status"],"DRIFT")
        with self.assertRaises(workspace.WorkspaceError):
            workspace.uninstall(self.dst,self.home,True)
        self.assertEqual((self.dst/"my-notes.md").read_text(),"user data")

    def test_symlink_target_and_outside_home_rejected(self):
        link=self.parent/"link"
        link.symlink_to(self.home, target_is_directory=True)
        for target in (link/"foo",self.home.parent/"escaped"):
            with self.assertRaises(workspace.WorkspaceError):
                workspace.install(target,self.home,True)

    def test_corrupt_bundled_source_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            (root/"catalog").mkdir()
            (root/"catalog/index.json").write_text((ROOT/"catalog/index.json").read_text())
            target=root/"catalog/templates/python-stdlib"
            target.mkdir(parents=True)
            for name in ("manifest.json",*workspace.FILES):
                data=(ROOT/"catalog/templates/python-stdlib"/name).read_bytes()
                (target/name).write_bytes(data)
            (target/"main.py").write_text("malicious edit")
            with self.assertRaises(workspace.WorkspaceError):
                workspace.verified_template(root)

    def test_existing_target_receipt_is_not_execution_authority(self):
        self.dst.mkdir()
        (self.dst/workspace.RECEIPT).write_text('{"formatVersion":1}')
        self.assertEqual(workspace.status(self.dst,self.home)["status"],"DRIFT")
        with self.assertRaises(workspace.WorkspaceError):
            workspace.uninstall(self.dst,self.home,True)

if __name__=="__main__":
    unittest.main()
