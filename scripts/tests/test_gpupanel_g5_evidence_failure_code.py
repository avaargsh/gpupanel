"""Fail-closed G5 diagnostic controls: bounded labels, never private values."""
import importlib.util
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]


def _load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts/install-test" / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


evidence = _load("g5_evidence_codes", "app_evidence_codes.py")
failure = _load("g5_vm_failure", "ci-failure.py")
INSTALL_ID = 42
TASK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"


def valid():
    return {
        "installId": INSTALL_ID, "taskId": TASK_ID, "taskStatus": "Success",
        "appStatus": "Running", "classification": "CONSISTENT", "verified": False,
        "containers": [{"state": "running", "name": "SECRET_CONTAINER_NAME"}],
        "secrets": "VERY_SECRET_TOKEN",
    }


class G5EvidenceFailureCodeTests(unittest.TestCase):
    def test_valid_evidence_stays_observational_only(self):
        self.assertEqual(evidence.classify_app_install_evidence(valid(), INSTALL_ID, TASK_ID), "ok")

    def test_each_independent_mismatch_is_unambiguous_and_redacted(self):
        changed = (
            ({"installId": 43}, "install-id"),
            ({"taskId": "PRIVATE_TASK"}, "task-id"),
            ({"taskStatus": "Executing"}, "task-status"),
            ({"appStatus": "Pending"}, "app-status"),
            ({"classification": "PARTIAL"}, "classification-other"),
            ({"classification": "PARTIAL", "containers": []}, "classification-container-empty"),
            ({"classification": "PARTIAL", "containers": "PRIVATE"}, "classification-container-malformed"),
            ({"classification": "PARTIAL", "containers": [{"state": "exited"}]}, "classification-container-state"),
            ({"verified": True}, "verification-flag"),
            ({"containers": []}, "container-count"),
            ({"containers": [{"state": "exited", "name": "PRIVATE"}]}, "container-state"),
            ({"containers": "SECRET_STRING"}, "container-count"),
        )
        for edits, code in changed:
            with self.subTest(code=code):
                payload = valid()
                payload.update(edits)
                label = evidence.classify_app_install_evidence(payload, INSTALL_ID, TASK_ID)
                self.assertEqual(label, code)
                self.assertNotIn("PRIVATE", label)
                self.assertNotIn("SECRET", label)
                self.assertNotIn(TASK_ID, label)

    def test_malformed_json_value_is_fail_closed(self):
        for case in (None, [], "PRIVATE_BODY", {}, {"installId": True}):
            with self.subTest(case=type(case).__name__):
                self.assertNotEqual(
                    evidence.classify_app_install_evidence(case, INSTALL_ID, TASK_ID), "ok"
                )

    def test_vm_ci_uses_strict_allowlist_with_negative_forgery(self):
        self.assertEqual(failure.app_evidence_code(
            "G5_APP_EVIDENCE_FAILURE_CODE=classification release=NO_GO\n"
            "password=SECRET_TOKEN\n"), "classification")
        for malicious in (
            "G5_APP_EVIDENCE_FAILURE_CODE=/etc/passwd release=NO_GO\n",
            "G5_APP_EVIDENCE_FAILURE_CODE=classification password=SECRET release=NO_GO\n",
            "G5_APP_EVIDENCE_FAILURE_CODE=classification release=GO\n",
            "G5_APP_EVIDENCE_FAILURE_CODE=classification release=NO_GO EXTRA\n",
        ):
            self.assertEqual(failure.app_evidence_code(malicious), "unknown")
        self.assertEqual(failure.app_evidence_code("password=SECRET\n"), "unknown")

    def test_docker_state_summary_allowlist_and_forgery_rejection(self):
        for state in ("running", "created", "exited", "restarting", "paused",
                      "removing", "dead", "missing", "other", "unavailable"):
            self.assertEqual(failure.app_docker_state(
                "G5_APP_DOCKER_STATE=" + state + " release=NO_GO\\n"
            ), state)
        for invalid in (
            "G5_APP_DOCKER_STATE=SECRET release=NO_GO\\n",
            "G5_APP_DOCKER_STATE=running token=SECRET release=NO_GO\\n",
            "G5_APP_DOCKER_STATE=running release=GO\\n",
        ):
            self.assertEqual(failure.app_docker_state(invalid), "unknown")

    def test_source_keeps_diagnostic_read_only_and_no_mutation_retry(self):
        script = (ROOT / "scripts/install-test/app-install-live.py").read_text()
        self.assertIn("classify_app_install_evidence(", script)
        self.assertIn('G5_APP_EVIDENCE_FAILURE_CODE=', script)
        self.assertIn('raise RuntimeError("task outcome ambiguous; do NOT retry")', script)
        self.assertIn('evidence_code != "ok"', script)


if __name__ == "__main__":
    unittest.main()
