import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("gpupanel_namespace_audit", ROOT / "scripts/gpupanel-runtime-namespace.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class RuntimeNamespaceAudit(unittest.TestCase):
    def test_known_inherited_paths_prevent_release_claim(self):
        report = audit.audit(ROOT)
        self.assertFalse(report["installable"])
        self.assertFalse(report["readyForProduction"])
        self.assertFalse(report["mutationPerformed"])
        self.assertGreaterEqual(report["blocked"], 7)
        self.assertEqual(report["unknown"], 0)
        self.assertEqual(len(report["issues"]), len(audit.RISKS))

    def test_missing_signature_is_unknown_not_pass(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            relative = audit.RISKS[0][1]
            source = root / relative
            source.parent.mkdir(parents=True)
            source.write_text("refactored code")
            report = audit.audit(root)
            self.assertEqual(report["blocked"], 0)
            self.assertEqual(report["unknown"], len(audit.RISKS))
            self.assertFalse(report["installable"])

    def test_symlink_source_is_not_trusted(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            relative = audit.RISKS[0][1]
            source = root / relative
            source.parent.mkdir(parents=True)
            source.symlink_to("/etc/passwd")
            report = audit.audit(root)
            self.assertEqual(report["issues"][0]["state"], "UNKNOWN")

    def test_report_is_deterministic(self):
        report1 = audit.audit(ROOT)
        report2 = audit.audit(ROOT)
        self.assertEqual(report1, report2)


if __name__ == "__main__":
    unittest.main()
