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
        self.assertIn("pnpm typecheck", docs)
        self.assertIn("SECURITY.md", docs)
        self.assertTrue((ROOT / "scripts/gpupanel-bootstrap.py").is_file())

    def test_engineering_contract_maps_to_existing_toolchain(self):
        contract = (ROOT / "AGENTS.md").read_text()
        adr = (ROOT / "docs/gpupanel/ADR-0001-FORK-FIRST.md").read_text()
        contributing = (ROOT / "CONTRIBUTING.md").read_text()
        pr = (ROOT / ".github/PULL_REQUEST_TEMPLATE.md").read_text()
        for name in ("core/", "agent/", "frontend/", "catalog/"):
            self.assertIn(name, contract)
        for phrase in ("500 physical lines", "pnpm typecheck", "pnpm build",
                       "idempotency", "GPL-3.0", "NOT RUN"):
            self.assertIn(phrase, contract)
        self.assertIn("fork", adr.lower())
        self.assertIn("existing live installation", adr)
        self.assertIn("AGENTS.md", contributing)
        self.assertIn("ADR-0001", contributing)
        for phrase in ("Security, isolation", "rollback", "N/A", "head SHA"):
            self.assertIn(phrase, pr)
        self.assertTrue((ROOT / "frontend/pnpm-lock.yaml").is_file())
        self.assertFalse((ROOT / "bun.lock").exists())
        self.assertFalse((ROOT / "bun.lockb").exists())


if __name__ == "__main__":
    unittest.main()
