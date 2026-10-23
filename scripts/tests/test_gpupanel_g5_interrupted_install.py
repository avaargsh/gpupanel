import importlib.util
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]


def load_module(name, filename):
    spec = importlib.util.spec_from_file_location(
        name, ROOT / "scripts/install-test" / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


evidence = load_module("g5_interrupted_evidence", "app_evidence_codes.py")
INSTALL_ID = 42
TASK_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"


class InterruptedInstallEvidenceTests(unittest.TestCase):
    def test_unknown_requires_exact_durable_outcome(self):
        payload = {"http": 200, "code": 200, "data": {
            "installId": INSTALL_ID, "taskId": TASK_ID,
            "taskStatus": "Unknown", "appStatus": "Unknown",
            "classification": "UNKNOWN",
            "reasons": ["INSTALL_OUTCOME_NOT_RECONCILED"],
            "verified": False,
        }}
        self.assertEqual(
            evidence.classify_unknown_fence(payload, INSTALL_ID, TASK_ID),
            "unknown")
        cases = (
            (None, "malformed"),
            ({"http": 503, "code": None}, "unavailable"),
            ({**payload, "http": 404}, "unavailable"),
            ({"http": 200, "code": 200, "data": {
                **payload["data"], "taskStatus": "Executing"}}, "not-unknown"),
            ({"http": 200, "code": 200, "data": {
                **payload["data"], "verified": True}}, "evidence-changed"),
            ({"http": 200, "code": 200, "data": {
                **payload["data"], "taskId": "PRIVATE_TASK"}}, "evidence-changed"),
        )
        for response, expected in cases:
            with self.subTest(expected=expected):
                result = evidence.classify_unknown_fence(
                    response, INSTALL_ID, TASK_ID)
                self.assertEqual(result, expected)
                self.assertNotIn("PRIVATE", result)

    def test_inflight_receipt_matches_task_and_resource_identity(self):
        task = {"id": TASK_ID, "type": "App", "operate": "TaskInstall",
                "status": "Executing", "resourceID": INSTALL_ID}
        self.assertEqual(
            evidence.classify_inflight_receipt({"items": [task]}, TASK_ID),
            "executing")
        self.assertEqual(
            evidence.classify_inflight_receipt({"items": []}, TASK_ID),
            "absent")
        self.assertEqual(evidence.classify_inflight_receipt(
            {"items": [{**task, "status": "Success"}]}, TASK_ID),
            "terminal")
        self.assertEqual(evidence.classify_inflight_receipt(
            {"items": [{**task, "resourceID": True}]}, TASK_ID),
            "malformed")
        self.assertEqual(evidence.classify_inflight_receipt(
            {"items": [{**task, "type": "PRIVATE"}]}, TASK_ID),
            "malformed")

    def test_mutation_refusal_requires_unchanged_observation(self):
        denied = {"http": 200, "code": 409}
        inventory = {"containers": [], "networks": [], "volumes": []}
        classify = evidence.classify_gate_refusal
        self.assertEqual(classify(denied, inventory, inventory, True), "refused")
        self.assertEqual(classify({"http": 200, "code": 200}, inventory,
                                  inventory, True), "accepted")
        self.assertEqual(classify({"http": 503, "code": 0}, inventory,
                                  inventory, True), "unavailable")
        changed = {**inventory, "containers": ["changed"]}
        self.assertEqual(classify(denied, inventory, changed, True),
                         "inventory-changed")
        self.assertEqual(classify(denied, inventory, inventory, False),
                         "evidence-changed")

    def test_live_probe_starts_install_in_background_then_observes_taskdb(self):
        probe = (ROOT / "scripts/install-test/app_fault_probe.py").read_text()
        self.assertIn("void fetch('/api/v1/apps/install'", probe)
        self.assertIn("install_id = wait_task_executing(request, task_id)", probe)
        self.assertLess(probe.index("install_id = wait_task_executing"),
                        probe.index('"stop", "docker.service"'))
        self.assertIn('"resourceID"',
                      (ROOT / "scripts/install-test/app_evidence_codes.py").read_text())
        self.assertNotIn('created = request("POST", "/apps/install"', probe)

    def test_fixture_barrier_is_fault_name_scoped_and_cleaned(self):
        fixture = (ROOT / "scripts/install-test/app-fixture-guest.py").read_text()
        self.assertIn('*-fault)', fixture)
        self.assertIn("/run/gpupanel-g5-init-release", fixture)
        self.assertIn('version / "scripts"', fixture)


if __name__ == "__main__":
    unittest.main()
