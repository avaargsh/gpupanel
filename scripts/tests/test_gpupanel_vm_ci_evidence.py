"""Source-only gate for sanitized full-chain VM CI evidence (no VM launched)."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "scripts/install-test/ci-evidence.py"
spec = importlib.util.spec_from_file_location("vm_ci_evidence", SOURCE)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class LiveVmEvidence(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.state = Path(temp.name)
        self.source = "b" * 40
        self.candidate = {
            "source_sha": self.source,
            "binary_sha256": {"core": "a" * 64, "agent": "c" * 64},
        }
        self.browser = {
            "kind": "LIVE local VM; no intercepted APIs",
            "candidate": self.candidate,
            "guest_machine_id_sha256": "d" * 64,
            "browser_page_errors": [],
            "live_operations_center_read_only": True,
            "username": "MUST_NOT_LEAK",
        }
        self.runtime = {
            "candidate": self.candidate,
            "guest_machine_id_sha256": "d" * 64,
            "same_candidate_live_browser_verified": True,
            "two_clean_agent_restarts": True,
            "explicit_fixture_operator_recovery": True,
            "fixture_marker_and_login_settings_retained": True,
            "other_secret": "SECRET_LOG_SHOULD_NEVER_APPEAR",
        }
        (self.state / "ubuntu2404").mkdir()
        self.write("ubuntu2404/image-provenance.json", {
            "signed_checksum_verified": True,
            "url": "DO_NOT_PRINT_VM_IMAGE_PROVIDER",
        })
        self.write("browser-live.json", self.browser)
        self.write("runtime-live.json", self.runtime)
        (self.state / "ci-stages.txt").write_text(
            "\n".join(audit.STAGES) + "\n"
        )

    def write(self, name, content):
        (self.state / name).write_text(json.dumps(content))

    def summarise(self, completed=True):
        return audit.summarize(self.state, run_completed=completed,
                               source_sha=self.source)

    def test_full_real_flag_is_only_partial_m0_no_go(self):
        result = self.summarise()
        self.assertEqual(result["status"], "PARTIAL_ACCEPTED")
        self.assertEqual(result["m0_release_decision"], "NO_GO")
        self.assertEqual(result["upgrade_and_rollback"], "NOT_RUN")
        self.assertEqual(result["full_app_compose_install_lifecycle"], "NOT_RUN")
        self.assertEqual(result["independent_reviewer"], "NOT_ATTESTED")
        encoded = json.dumps(result)
        for secret in ("MUST_NOT_LEAK", "SECRET_LOG_SHOULD_NEVER_APPEAR",
                       "DO_NOT_PRINT_VM_IMAGE_PROVIDER"):
            self.assertNotIn(secret, encoded)

    def test_early_failure_cannot_mark_pass(self):
        self.assertEqual(self.summarise(completed=False)["status"], "BLOCKED_OR_FAILED")
        self.assertEqual(self.summarise()["fresh_install"], "PASS")
        for stages in (
            audit.STAGES[:-1], audit.STAGES + ("another",),
            audit.STAGES[:1] + ("guest_agent_recovery",),
            audit.STAGES + ("guest_agent_recovery",),
        ):
            (self.state / "ci-stages.txt").write_text("\n".join(stages) + "\n")
            self.assertEqual(self.summarise()["status"], "BLOCKED_OR_FAILED")

    def test_foreign_guest_and_missing_browser_fail_closed(self):
        self.write("runtime-live.json", {
            **self.runtime, "guest_machine_id_sha256": "0" * 64,
        })
        self.assertEqual(self.summarise()["status"], "BLOCKED_OR_FAILED")
        self.write("runtime-live.json", self.runtime)
        (self.state / "browser-live.json").unlink()
        self.assertEqual(self.summarise()["status"], "BLOCKED_OR_FAILED")

    def test_wrong_binary_and_missing_agent_recovery_rejected(self):
        self.write("runtime-live.json", {
            **self.runtime,
            "candidate": {**self.candidate, "binary_sha256": {
                "core": "a" * 64, "agent": "0" * 64,
            }},
        })
        self.assertEqual(self.summarise()["status"], "BLOCKED_OR_FAILED")
        self.write("runtime-live.json", {
            **self.runtime, "explicit_fixture_operator_recovery": False,
        })
        self.assertEqual(self.summarise()["status"], "BLOCKED_OR_FAILED")

    def test_workflow_only_uploads_redacted_json(self):
        flow = (ROOT / ".github/workflows/gpupanel-real-ubuntu-vm.yml").read_text()
        self.assertIn("persist-credentials: false", flow)
        self.assertIn("python3 scripts/install-test/ci-live-vm.sh", flow.replace(
            "bash scripts/install-test/ci-live-vm.sh",
            "python3 scripts/install-test/ci-live-vm.sh",
        ))
        self.assertIn("path: .local/install-test/ci-evidence.json", flow)
        self.assertNotIn("path: .local/install-test/ubuntu2404/", flow)
        self.assertNotIn("path: .local/install-test/install.raw.log", flow)
        self.assertIn("retention-days: 7", flow)


if __name__ == "__main__":
    unittest.main()
