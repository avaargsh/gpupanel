import importlib.util
from pathlib import Path
import sys
import unittest


ROOT = Path(__file__).resolve().parents[2]


def load_module(name, filename):
    spec = importlib.util.spec_from_file_location(
        name, ROOT / "scripts/install-test" / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


evidence = load_module("g5_interrupted_evidence", "app_evidence_codes.py")
sys.modules["app_evidence_codes"] = evidence
failure = load_module("g5_interrupted_failure", "ci-failure.py")
probe = load_module("g5_fault_probe", "app_fault_probe.py")
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

    def test_mutation_refusal_requires_exact_gate_detail_and_unchanged_observation(self):
        detail = evidence.UNKNOWN_MUTATION_REFUSAL_DETAIL
        denied = {
            "http": 200, "code": 500,
            "message": "Internal server error: " + detail,
        }
        inventory = {"containers": [], "networks": [], "volumes": []}
        classify = evidence.classify_gate_refusal
        self.assertEqual(classify(denied, inventory, inventory, True), "refused")
        self.assertEqual(classify({"http": 200, "code": 200}, inventory,
                                  inventory, True), "accepted")
        self.assertEqual(classify({"http": 503, "code": 0}, inventory,
                                  inventory, True), "unavailable")
        # A generic Agent error uses the same HTTP-200/business-500 envelope.
        # It must not pass the gate assertion just because state stayed unchanged.
        generic_500 = {
            "http": 200, "code": 500,
            "message": "Internal server error: database is temporarily unavailable",
        }
        self.assertEqual(classify(generic_500, inventory, inventory, True),
                         "unavailable")
        generic_conflict = {
            "http": 200, "code": 409,
            "message": "another operation was rejected",
        }
        self.assertEqual(classify(generic_conflict, inventory, inventory, True),
                         "unexpected-error")
        self.assertEqual(classify({"http": 200, "code": 409}, inventory,
                                  inventory, True), "malformed")
        changed = {**inventory, "containers": ["changed"]}
        self.assertEqual(classify(denied, inventory, changed, True),
                         "inventory-changed")
        self.assertEqual(classify(denied, inventory, inventory, False),
                         "evidence-changed")
        source = (ROOT / "agent/app/service/app_operation_status.go").read_text()
        self.assertIn(detail, source)

    def test_unknown_operation_failure_code_allowlist_is_fixed(self):
        for category in (
            "control-unavailable", "delete-accepted", "delete-unavailable",
            "delete-malformed", "delete-inventory-changed",
            "delete-evidence-changed", "delete-unexpected-error",
        ):
            self.assertEqual(failure.app_unknown_op_fence_code(
                "G5_APP_UNKNOWN_OP_FENCE_CODE=" + category +
                " release=NO_GO\n"), category)
        for invalid in (
            "delete-generic-error-detail=SECRET",
            "delete-unexpected-error message=PRIVATE",
            "delete-unexpected-error release=GO",
        ):
            self.assertEqual(failure.app_unknown_op_fence_code(
                "G5_APP_UNKNOWN_OP_FENCE_CODE=" + invalid +
                " release=NO_GO\n"), "unknown")

    def test_live_probe_starts_install_in_background_then_observes_taskdb(self):
        probe = (ROOT / "scripts/install-test/app_fault_probe.py").read_text()
        self.assertIn("void fetch('/api/v1/apps/install'", probe)
        self.assertIn("install_id = wait_task_executing(request, task_id)", probe)
        self.assertLess(probe.index("install_id = wait_task_executing(request, task_id)"),
                        probe.index("if not _wait_init_barrier(guest_rc):"))
        self.assertLess(probe.index("if not _wait_init_barrier(guest_rc):"),
                        probe.index('"stop", "docker.service"'))
        self.assertIn('"resourceID"',
                      (ROOT / "scripts/install-test/app_evidence_codes.py").read_text())
        self.assertNotIn('created = request("POST", "/apps/install"', probe)

    def test_fixture_barrier_is_fault_name_scoped_and_cleaned(self):
        fixture = (ROOT / "scripts/install-test/app-fixture-guest.py").read_text()
        self.assertIn('*-fault)', fixture)
        self.assertIn("/run/gpupanel-g5-init-entered", fixture)
        self.assertIn(": > /run/gpupanel-g5-init-entered", fixture)
        self.assertIn("/run/gpupanel-g5-init-release", fixture)
        self.assertIn('version / "scripts"', fixture)
        self.assertIn('marker.unlink(missing_ok=True)', fixture)

    def test_default_network_is_verified_as_a_fixture_precondition(self):
        inspect = ["sudo", "timeout", "10", "docker", "network",
                   "inspect", "gpupanel-network"]
        create = ["sudo", "timeout", "10", "docker", "network",
                  "create", "gpupanel-network"]
        calls = []
        outcomes = iter((1, 0, 0))
        self.assertIsNone(probe._ensure_default_network(
            lambda args: calls.append(args) or next(outcomes)))
        self.assertEqual(calls, [inspect, create, inspect])
        calls = []
        self.assertIsNone(probe._ensure_default_network(
            lambda args: calls.append(args) or 0))
        self.assertEqual(calls, [inspect])

    def test_init_barrier_wait_is_bounded_and_uses_fixed_guest_marker(self):
        calls = []
        self.assertTrue(probe._wait_init_barrier(
            lambda args: calls.append(args) or 0, attempts=1))
        self.assertEqual(calls, [["sudo", "test", "-f",
                                  "/run/gpupanel-g5-init-entered"]])
        self.assertFalse(probe._wait_init_barrier(lambda args: 1, attempts=0))

    def test_fault_probe_preconditions_inventory_and_waits_for_barrier(self):
        source = (ROOT / "scripts/install-test/app_fault_probe.py").read_text()
        body = source[source.index("def inject("):]
        self.assertLess(body.index("_ensure_default_network(guest_rc)"),
                        body.index("docker_before = guest_inventory()"))
        self.assertLess(body.index("if not _wait_init_barrier(guest_rc):"),
                        body.index('"stop", "docker.service"'))

    def test_failure_output_uses_only_fixed_recovery_categories(self):
        categories = (
            "agent-evidence-unavailable", "agent-socket-cleanup-unavailable",
            "agent-start-unavailable", "docker-unit-start-unavailable",
            "docker-api-unavailable", "container-side-effects",
            "network-side-effects", "volume-side-effects",
            "fixture-network-unavailable", "init-barrier-not-reached",
            "pre-agent-network-count-drift",
            "pre-agent-network-identity-drift",
            "post-agent-network-count-drift",
            "post-agent-network-identity-drift",
        )
        for category in categories:
            with self.subTest(category=category):
                self.assertEqual(failure.app_unknown_fence_code(
                    "G5_APP_UNKNOWN_FENCE_CODE=" + category +
                    " release=NO_GO\n"), category)
        self.assertEqual(failure.app_unknown_fence_code(
            "G5_APP_UNKNOWN_FENCE_CODE=secret release=NO_GO\n"), "unknown")

    def test_network_drift_is_staged_but_never_accepted(self):
        baseline = {"networks": ["network-id-a", "network-id-b"]}
        clean = {"networks": ["network-id-a", "network-id-b"]}
        changed_id = {"networks": ["network-id-a", "network-id-c"]}
        added = {"networks": ["network-id-a", "network-id-b", "network-id-c"]}
        cases = (
            (clean, clean, "ok"),
            (changed_id, changed_id, "pre-agent-network-identity-drift"),
            (added, added, "pre-agent-network-count-drift"),
            (clean, changed_id, "post-agent-network-identity-drift"),
            (clean, added, "post-agent-network-count-drift"),
            (changed_id, clean, "ok"),
        )
        for before_agent, final, expected in cases:
            with self.subTest(expected=expected):
                actual = probe.classify_network_drift(
                    baseline, before_agent, final)
                self.assertEqual(actual, expected)
                # Reject synthetic network IDs without mistaking the fixed
                # diagnostic word "identity" for an ID leak.
                for network_id in ("network-id-a", "network-id-b", "network-id-c"):
                    self.assertNotIn(network_id, actual)

    def test_network_drift_family_labels_are_fixed_and_redacted(self):
        baseline = {"networks": [
            "id-a|bridge|bridge|local",
            "id-b|gpupanel-network|bridge|local",
            "id-c|project_default|bridge|local"]}
        built_in = {"networks": [
            "id-x|bridge|bridge|local",
            "id-b|gpupanel-network|bridge|local",
            "id-c|project_default|bridge|local"]}
        shared = {"networks": [
            "id-a|bridge|bridge|local",
            "id-y|gpupanel-network|bridge|local",
            "id-c|project_default|bridge|local"]}
        custom = {"networks": [
            "id-a|bridge|bridge|local",
            "id-b|gpupanel-network|bridge|local",
            "id-z|project_default|bridge|local"]}
        membership = {"networks": [
            "id-a|bridge|bridge|local",
            "id-b|gpupanel-network|bridge|local",
            "id-c|other_default|bridge|local"]}
        mixed = {"networks": [
            "id-x|bridge|bridge|local",
            "id-b|gpupanel-network|bridge|local",
            "id-z|project_default|bridge|local"]}
        cases = (
            (built_in, built_in, "pre-agent-builtin-network-identity-drift"),
            (baseline, shared, "post-agent-shared-network-identity-drift"),
            (baseline, custom, "post-agent-custom-network-identity-drift"),
            (membership, membership, "pre-agent-network-membership-drift"),
            (mixed, mixed, "pre-agent-mixed-network-identity-drift"),
        )
        for before_agent, final, expected in cases:
            with self.subTest(expected=expected):
                actual = probe.classify_network_drift(
                    baseline, before_agent, final)
                self.assertEqual(actual, expected)
                for private_value in (
                    "id-a", "id-b", "id-c", "id-x", "id-y", "id-z",
                    "gpupanel-network", "project_default", "other_default",
                ):
                    self.assertNotIn(private_value, actual)

    def test_docker_restart_only_allows_builtin_bridge_id_rotation(self):
        baseline = {"networks": [
            "id-a|bridge|bridge|local",
            "id-b|host|host|local",
            "id-c|none|null|local",
            "id-d|gpupanel-network|bridge|local",
            "id-e|project_default|bridge|local"]}
        bridge_rotated = {"networks": [
            "id-x|bridge|bridge|local",
            "id-b|host|host|local",
            "id-c|none|null|local",
            "id-d|gpupanel-network|bridge|local",
            "id-e|project_default|bridge|local"]}
        shared_rotated = {"networks": [
            "id-x|bridge|bridge|local",
            "id-b|host|host|local",
            "id-c|none|null|local",
            "id-y|gpupanel-network|bridge|local",
            "id-e|project_default|bridge|local"]}
        membership_changed = {"networks": [
            "id-x|bridge|bridge|local",
            "id-b|host|host|local",
            "id-c|none|null|local",
            "id-d|gpupanel-network|bridge|local",
            "id-e|other_default|bridge|local"]}
        invalid_bridge = {"networks": [
            "id-x|bridge|other-driver|local",
            "id-b|host|host|local",
            "id-c|none|null|local",
            "id-d|gpupanel-network|bridge|local",
            "id-e|project_default|bridge|local"]}
        self.assertTrue(probe.network_inventory_unchanged_after_docker_restart(
            baseline, bridge_rotated))
        for changed in (shared_rotated, membership_changed, invalid_bridge):
            with self.subTest(changed=changed["networks"][0]):
                self.assertFalse(
                    probe.network_inventory_unchanged_after_docker_restart(
                        baseline, changed))

    def test_network_snapshot_precedes_agent_restart(self):
        source = (ROOT / "scripts/install-test/app_fault_probe.py").read_text()
        self.assertLess(
            source.index("before_agent = guest_inventory()"),
            source.index('["sudo", "systemctl", "start", "gpupanel-agent"]'))
        self.assertLess(
            source.index("network_inventory_unchanged_after_docker_restart("),
            source.index('["sudo", "systemctl", "start", "gpupanel-agent"]'))
        self.assertIn('if after["networks"] != before_agent["networks"]:', source)

    def test_freeze_requires_inactive_units_and_privileged_api(self):
        commands = [
            ["sudo", "systemctl", "is-active", "--quiet", "docker.service"],
            ["sudo", "systemctl", "is-active", "--quiet", "docker.socket"],
            ["sudo", "timeout", "3", "docker", "version", "--format",
             "{{.Server.Version}}"],
        ]
        observed = []
        self.assertTrue(probe._docker_is_frozen(
            lambda args: observed.append(args) or 1))
        self.assertEqual(observed, commands)

        # If either unit is still active, or the privileged API is usable,
        # Docker was not actually frozen, regardless of the stop command's rc.
        for index in range(len(commands)):
            with self.subTest(active_check=index):
                observed = []
                codes = [1, 1, 1]
                codes[index] = 0

                def guest_rc(args):
                    observed.append(args)
                    return codes[len(observed) - 1]

                self.assertFalse(probe._docker_is_frozen(guest_rc))
                self.assertEqual(observed, commands[:index + 1])

    def test_docker_readiness_probe_is_bounded(self):
        calls = []
        self.assertTrue(probe._wait_docker_ready(
            lambda args: calls.append(args) or 0))
        self.assertEqual(calls, [[
            "sudo", "timeout", "3", "docker", "version", "--format",
            "{{.Server.Version}}",
        ]])
        self.assertFalse(probe._wait_docker_ready(
            lambda command: 1, attempts=0))


if __name__ == "__main__":
    unittest.main()
