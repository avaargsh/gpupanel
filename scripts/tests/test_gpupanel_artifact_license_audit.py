"""Offline integration tests: preview-archive self-checks are not trusted provenance."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("gpupanel_artifact_audit", SCRIPTS / "gpupanel-artifact-license-audit.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class ArtifactLicenseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        self.git("init", "-q")
        self.git("config", "user.email", "fixture@example.invalid")
        self.git("config", "user.name", "Fixture")
        self.write("LICENSE", "                    GNU GENERAL PUBLIC LICENSE\nVersion 3\nfixture\n")
        self.write("module.go", "package main\n")
        self.git("add", ".")
        self.git("commit", "-qm", "upstream")
        self.baseline = self.git("rev-parse", "HEAD").strip()
        self.write("NOTICE.md", "GPUPanel is a fork of 1Panel under GPL-3.0\n")
        self.git("add", ".")
        self.git("commit", "-qm", "fork")
        self.source = self.git("rev-parse", "HEAD").strip()

    def write(self, name, content):
        path = self.repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.repo, text=True,
                              capture_output=True, check=True).stdout

    def packaged(self, *, license_text=None, notice_text=None, source=None):
        stage = self.root / "stage"
        stage.mkdir(exist_ok=True)
        (stage / "bin").mkdir(exist_ok=True)
        (stage / "bin/1panel-core").write_bytes(b"fake core binary")
        (stage / "bin/1panel-agent").write_bytes(b"fake agent binary")
        (stage / "LICENSE").write_text(
            self.repo.joinpath("LICENSE").read_text() if license_text is None else license_text)
        (stage / "NOTICE.md").write_text(
            self.repo.joinpath("NOTICE.md").read_text() if notice_text is None else notice_text)
        archive = self.root / "preview.tar.gz"
        audit.release.package(stage, archive, "dev", {
            "source_commit": self.source if source is None else source,
            "production_install_ready": False,
        })
        return archive

    def inspect(self, archive=None, baseline=None):
        return audit.inspect(self.repo, archive or self.packaged(), baseline or self.baseline)

    def test_legitimate_preview_bound_to_committed_git_notices(self):
        result = self.inspect()
        self.assertEqual(result["result"], "GPL_ATTRIBUTION_BOUND_TO_SOURCE")
        self.assertEqual(result["source_commit"], self.source)
        self.assertIn("Apache-2.0_eligibility", result["not_proven"])
        self.assertFalse(result["installable"])

    def test_repacked_archive_with_new_license_still_passes_inner_checksum(self):
        path = self.packaged(license_text="Apache License Version 2.0")
        self.assertTrue(audit.release.verify(path)["verified"])
        with self.assertRaisesRegex(audit.AttestationError, "LICENSE differs"):
            self.inspect(path)

    def test_repacked_archive_with_changed_notice_rejected(self):
        path = self.packaged(notice_text="new attribution omitted")
        self.assertTrue(audit.release.verify(path)["verified"])
        with self.assertRaisesRegex(audit.AttestationError, "NOTICE.md differs"):
            self.inspect(path)

    def test_modified_gpl_root_cannot_be_legitimized_by_repackaging(self):
        self.write("LICENSE", "                    GNU GENERAL PUBLIC LICENSE\nVersion 3\nmodified\n")
        self.git("add", ".")
        self.git("commit", "-qm", "modified baseline license")
        self.source = self.git("rev-parse", "HEAD").strip()
        with self.assertRaisesRegex(audit.AttestationError, "trusted upstream"):
            self.inspect()

    def test_notice_removal_blocks_even_if_matching_archive(self):
        self.write("NOTICE.md", "no proper copyright text")
        self.git("add", ".")
        self.git("commit", "-qm", "removed attribution")
        self.source = self.git("rev-parse", "HEAD").strip()
        with self.assertRaisesRegex(audit.AttestationError, "missing 1Panel/GPL"):
            self.inspect()

    def test_missing_or_unrelated_git_evidence_fails_closed(self):
        with self.assertRaises(audit.AttestationError):
            self.inspect(baseline="f" * 40)
        with self.assertRaises(audit.AttestationError):
            self.inspect(baseline=self.source) if self.source != self.baseline else None

    def test_unknown_source_revision_is_not_a_provenance_claim(self):
        with self.assertRaisesRegex(audit.AttestationError, "full Git SHA"):
            self.inspect(self.packaged(source="unknown"))

    def test_self_checksum_corruption_rejected_before_provenance(self):
        path = self.packaged()
        path.write_bytes(b"not a tar.gz")
        with self.assertRaises(audit.AttestationError):
            self.inspect(path)

    def test_cli_emits_deterministic_report_without_mutating_repo(self):
        path = self.packaged()
        output = self.root / "attestation.json"
        self.assertEqual(audit.main(["--repo", str(self.repo), "--archive", str(path),
                                      "--baseline", self.baseline, "--output", str(output)]), 0)
        self.assertEqual(json.loads(output.read_text())["source_commit"], self.source)
        self.assertEqual(self.git("status", "--porcelain"), "")
        self.assertEqual(self.inspect(path), self.inspect(path))


if __name__ == "__main__":
    unittest.main()
