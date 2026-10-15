"""Static contract for GPUPanel community and reporting entry points."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]


class CommunityDocsTest(unittest.TestCase):
    def test_no_upstream_assignee_or_security_contact(self):
        for name in (
            ".github/ISSUE_TEMPLATE/1_bug_report.yml",
            ".github/ISSUE_TEMPLATE/2_feature_request.yml",
            ".github/ISSUE_TEMPLATE/config.yml",
            "SECURITY.md",
        ):
            with self.subTest(file=name):
                content = (ROOT / name).read_text()
                self.assertNotIn("assignees: wanghe-fit2cloud", content)
                self.assertNotIn("wanghe@fit2cloud.com", content)
                self.assertIn("GPUPanel", content)

    def test_security_does_not_claim_upstream_support(self):
        content = (ROOT / "SECURITY.md").read_text()
        self.assertIn("development preview", content)
        self.assertIn("do **not**", content)
        self.assertIn("private", content)

    def test_bug_form_requires_repro_and_redaction(self):
        content = (ROOT / ".github/ISSUE_TEMPLATE/1_bug_report.yml").read_text()
        for phrase in ("Steps to reproduce", "GPUPanel version / commit SHA", "Safety check"):
            self.assertIn(phrase, content)
        self.assertIn("required: true", content)

    def test_contribution_commands_exist(self):
        docs = (ROOT / "CONTRIBUTING.md").read_text()
        self.assertIn("self-test --human", docs)
        self.assertIn("npm run type-check", docs)
        self.assertIn("SECURITY.md", docs)
        self.assertTrue((ROOT / "scripts/gpupanel-bootstrap.py").is_file())


if __name__ == "__main__":
    unittest.main()
