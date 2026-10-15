import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location("gpupanel_runtime_audit",ROOT/"scripts/gpupanel-runtime-audit.py")
audit=importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

class RuntimeIsolationGate(unittest.TestCase):
    def test_real_repository_is_not_isolated(self):
        report=audit.inspect(ROOT)
        self.assertEqual(report["status"],"BLOCKED")
        self.assertFalse(report["standaloneInstallAllowed"])
        self.assertFalse(report["independentRuntimeVerification"])
        self.assertEqual(report["legacyAnchorsDetected"],report["requiredChecks"])
        self.assertEqual(report["unresolvedChecks"],[])
        codes={f["code"] for f in report["findings"]}
        self.assertEqual(codes,audit.GATE_NAMES)
        self.assertTrue(all(row["line"]>0 for row in report["findings"]))

    def test_source_anchor_disappearing_is_review_not_pass(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            for path in audit.REQUIRED:
                dest=root/path
                dest.parent.mkdir(parents=True,exist_ok=True)
                dest.write_text((ROOT/path).read_text())
            p=root/"agent/server/server.go"
            p.write_text("package server")
            report=audit.inspect(root)
            self.assertEqual(report["status"],"BLOCKED")
            self.assertFalse(report["standaloneInstallAllowed"])
            self.assertIn("agent/server/server.go:master_socket",report["unresolvedChecks"])

    def test_moved_all_anchors_never_false_positive(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            for path in audit.REQUIRED:
                p=root/path
                p.parent.mkdir(parents=True,exist_ok=True)
                p.write_text("package sample")
            report=audit.inspect(root)
            self.assertEqual(report["status"],"REVIEW_REQUIRED")
            self.assertEqual(report["legacyAnchorsDetected"],0)
            self.assertFalse(report["standaloneInstallAllowed"])
            self.assertEqual(len(report["unresolvedChecks"]),report["requiredChecks"])

    def test_missing_or_symlinked_source_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            self.assertEqual(len(audit.inspect(root)["unresolvedChecks"]),audit.inspect(ROOT)["requiredChecks"])
            link=root/"core/cmd/server/cmd/root.go"
            link.parent.mkdir(parents=True)
            link.symlink_to(ROOT/"core/cmd/server/cmd/root.go")
            self.assertIn("core/cmd/server/cmd/root.go",audit.inspect(root)["unresolvedChecks"])

if __name__=="__main__":
    unittest.main()
