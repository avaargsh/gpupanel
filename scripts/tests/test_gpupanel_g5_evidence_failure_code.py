"""Fail-closed G5 diagnostic controls: bounded labels, never private values."""
import importlib.util
from pathlib import Path
import re
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
                "G5_APP_DOCKER_STATE=" + state + " release=NO_GO\n"
            ), state)
        for invalid in (
            "G5_APP_DOCKER_STATE=SECRET release=NO_GO\n",
            "G5_APP_DOCKER_STATE=running token=SECRET release=NO_GO\n",
            "G5_APP_DOCKER_STATE=running release=GO\n",
        ):
            self.assertEqual(failure.app_docker_state(invalid), "unknown")

    def test_fixture_compose_uses_install_owned_container_identity(self):
        source = (ROOT / "scripts/install-test/app-fixture-guest.py").read_text()
        self.assertIn("container_name: ${CONTAINER_NAME}", source)
        self.assertIn("network_mode: none", source)
        self.assertIn("pull_policy: never", source)

    def test_source_keeps_diagnostic_read_only_and_no_mutation_retry(self):
        script = (ROOT / "scripts/install-test/app-install-live.py").read_text()
        self.assertIn("classify_app_install_evidence(", script)
        self.assertIn('G5_APP_EVIDENCE_FAILURE_CODE=', script)
        self.assertIn('raise RuntimeError("task outcome ambiguous; do NOT retry")', script)
        self.assertIn('evidence_code != "ok"', script)


class G5AppInstallRemovalObservationTests(unittest.TestCase):
    """The uninstalled AppInstall must be observed gone by payload contract.

    The Agent answers an absent AppInstall with HTTP 200 and status
    "Deleted" (agent/app/service/app_install.go). Requiring an HTTP refusal
    is unsatisfiable and cannot observe removal at all.
    """

    def removed_response(self):
        # Exact shape of response.AppInstallInfo{Status: StatusDeleted}.
        return {"http": 200, "code": 200, "data": {
            "id": 0, "name": "", "version": "", "status": "Deleted",
            "message": "", "HttpPort": 0, "container": "",
            "composePath": "", "appKey": "", "appPorts": None, "env": None,
        }}

    def test_removed_app_install_is_observed_as_removed(self):
        self.assertEqual(
            evidence.classify_app_install_removal(self.removed_response()),
            "removed")

    def test_not_found_read_is_never_observed_as_removed(self):
        # HTTP 404 is not an observation of removal: the Agent answers an
        # absent AppInstall with HTTP 200 and the deleted payload, so a 404
        # hides a business error and must fail closed.
        for response, code in (
            ({"http": 404, "code": 404, "data": None}, "refused"),
            ({"http": 404, "code": 500, "data": None}, "refused"),
            ({"http": 404, "code": 200, "data": None}, "refused"),
        ):
            with self.subTest(code=code):
                self.assertEqual(
                    evidence.classify_app_install_removal(response), code)

    def test_live_app_install_is_never_observed_as_removed(self):
        live = {"http": 200, "code": 200, "data": {
            "id": INSTALL_ID, "name": "PRIVATE_NAME", "status": "Running",
            "container": "GPUPanel-PRIVATE_CONTAINER",
            "composePath": "/opt/gpupanel/PRIVATE_PATH",
        }}
        self.assertEqual(
            evidence.classify_app_install_removal(live), "still-installed")
        pending = dict(live)
        pending["data"] = dict(live["data"], status="Uninstalling")
        self.assertEqual(
            evidence.classify_app_install_removal(pending), "still-installed")

    def test_deleted_status_with_identity_or_resource_is_not_removed(self):
        with_identity = {"http": 200, "code": 200, "data": {
            "id": INSTALL_ID, "status": "Deleted", "container": "",
            "composePath": "",
        }}
        self.assertEqual(
            evidence.classify_app_install_removal(with_identity),
            "identity-present")
        with_resource = {"http": 200, "code": 200, "data": {
            "id": 0, "status": "Deleted",
            "container": "GPUPanel-PRIVATE_CONTAINER", "composePath": "",
        }}
        self.assertEqual(
            evidence.classify_app_install_removal(with_resource),
            "resource-present")

    def test_incomplete_or_wrongly_typed_deleted_payload_fails_closed(self):
        # Reproduced false "removed" answers. Only a complete deleted
        # payload with an exact integer id 0 and exact empty container and
        # composePath strings proves removal; missing, None, bool, float or
        # wrongly typed fields fail closed.
        deleted = {"http": 200, "code": 200, "data": {
            "id": 0, "status": "Deleted", "container": "", "composePath": "",
        }}
        cases = (
            ({"http": 200, "code": 200, "data": {"status": "Deleted"}}, "malformed"),
            ({"http": 200, "code": 200, "data": {
                "status": "Deleted", "id": False, "container": "",
                "composePath": ""}}, "malformed"),
            ({"http": 200, "code": 200, "data": {
                "status": "Deleted", "id": 0.0, "container": "",
                "composePath": ""}}, "malformed"),
            ({"http": 200, "code": 200, "data": {
                "status": "Deleted", "id": "0", "container": "",
                "composePath": ""}}, "malformed"),
            ({"http": 200, "code": 200, "data": {
                "status": "Deleted", "id": None, "container": "",
                "composePath": ""}}, "malformed"),
            ({"http": 200, "code": 200, "data": {
                "status": "Deleted", "id": 0, "composePath": ""}}, "malformed"),
            ({"http": 200, "code": 200, "data": {
                "status": "Deleted", "id": 0, "container": "",
                "composePath": None}}, "malformed"),
            ({"http": 200, "code": 200, "data": {
                "status": "Deleted", "id": 0, "composePath": ""}}, "malformed"),
            ({"http": 200, "code": 200, "data": {
                "status": "Deleted", "id": 0, "container": ""}}, "malformed"),
            ({"http": 200, "code": 200, "data": {
                "status": "Deleted", "id": 0, "container": 0,
                "composePath": ""}}, "malformed"),
            ({"http": 200, "code": 200, "data": {
                "status": None, "id": 0, "container": "",
                "composePath": ""}}, "malformed"),
            ({"http": 200, "code": 200, "data": {
                "id": 0, "container": "", "composePath": ""}}, "malformed"),
        )
        for response, code in cases:
            with self.subTest(code=code):
                label = evidence.classify_app_install_removal(response)
                self.assertEqual(label, code)
                self.assertNotEqual(label, "removed")
        # The complete contract payload is still observed as removed.
        self.assertEqual(
            evidence.classify_app_install_removal(deleted), "removed")
        # A bool or float HTTP status is not an accepted answer either.
        for response in ({"http": True, "code": 200, "data": {}},
                         {"http": 200.0, "code": 200, "data": {}},
                         {"http": 200, "code": True, "data": {}}):
            with self.subTest(http=repr(response["http"])):
                self.assertEqual(
                    evidence.classify_app_install_removal(response), "malformed")

    def test_every_removal_label_stays_inside_the_ci_allowlist(self):
        responses = (
            {"http": 200, "code": 200, "data": {"status": "Deleted"}},
            {"http": 200, "code": 200, "data": {
                "status": "Deleted", "id": False, "container": "",
                "composePath": ""}},
            {"http": 404, "code": 500, "data": None},
            {"http": 500, "code": 500, "data": None},
            {"http": 403, "code": 403, "data": None},
            {"http": 200, "code": 200, "data": {
                "id": INSTALL_ID, "status": "Deleted", "container": "",
                "composePath": ""}},
            {"http": 200, "code": 200, "data": {
                "id": 0, "status": "Deleted", "container": "PRIVATE_CONTAINER",
                "composePath": ""}},
        )
        for response in responses:
            with self.subTest(response=sorted(response)):
                label = evidence.classify_app_install_removal(response)
                self.assertNotEqual(label, "removed")
                self.assertEqual(
                    failure.app_uninstall_removal_code(
                        "G5_APP_UNINSTALL_REMOVAL_CODE=" + label +
                        " release=NO_GO\n"),
                    label)
                self.assertNotIn("PRIVATE", label)

    def test_agent_dto_keeps_the_removed_payload_fields_explicit(self):
        dto = (ROOT / "agent/app/dto/response/app.go").read_text()
        block = re.search(r"type AppInstallInfo struct \{(.*?)\n\}", dto, re.S)
        self.assertIsNotNone(block)
        fields = block.group(1)
        for field in ("id", "status", "container", "composePath"):
            self.assertIn('json:"%s"' % field, fields)
        # Without omitempty the deleted payload always carries every field,
        # so a missing field can only be a malformed answer, never removal.
        self.assertNotIn("omitempty", fields)
        service = (ROOT / "agent/app/service/app_install.go").read_text()
        self.assertIn("Status: constant.StatusDeleted", service)
        api = (ROOT / "agent/app/api/v1/app_install.go").read_text()
        self.assertIn("helper.SuccessWithData(c, info)", api)

    def test_ambiguous_or_unhealthy_answers_fail_closed(self):
        cases = (
            ({"http": 500, "code": 500, "data": None}, "unavailable"),
            ({"http": 403, "code": 403, "data": None}, "refused"),
            ({"http": 200, "code": 200, "data": "PRIVATE_BODY"}, "malformed"),
            ({"http": "200", "code": 200, "data": {}}, "malformed"),
            ({"http": 200, "code": 200}, "malformed"),
            (None, "malformed"),
            ([], "malformed"),
            ("PRIVATE_BODY", "malformed"),
        )
        for response, code in cases:
            with self.subTest(code=code):
                label = evidence.classify_app_install_removal(response)
                self.assertEqual(label, code)
                self.assertNotIn("PRIVATE", label)

    def test_vm_ci_removal_code_allowlist_and_forgery_rejection(self):
        self.assertEqual(failure.app_uninstall_removal_code(
            "G5_APP_UNINSTALL_REMOVAL_CODE=still-installed release=NO_GO\n"),
            "still-installed")
        for malicious in (
            "G5_APP_UNINSTALL_REMOVAL_CODE=removed release=NO_GO\n",
            "G5_APP_UNINSTALL_REMOVAL_CODE=still-installed password=SECRET release=NO_GO\n",
            "G5_APP_UNINSTALL_REMOVAL_CODE=still-installed release=GO\n",
            "G5_APP_UNINSTALL_REMOVAL_CODE=still-installed release=NO_GO EXTRA\n",
            "G5_APP_UNINSTALL_REMOVAL_CODE=/etc/passwd release=NO_GO\n",
        ):
            self.assertEqual(failure.app_uninstall_removal_code(malicious),
                             "unknown")
        self.assertEqual(failure.app_uninstall_removal_code("password=SECRET\n"),
                         "unknown")

    def test_duplicate_fence_requires_refusal_and_unchanged_inventory(self):
        inventory = {
            "apps": 1, "tasks": 5, "containers": ["container"],
            "networks": [], "volumes": [],
        }
        for response, code in (
            ({"http": 200, "code": 400, "data": None}, "denied"),
            ({"http": 400, "code": 400, "data": None}, "denied"),
            ({"http": 200, "code": 200, "data": None}, "accepted"),
            ({"http": 500, "code": 500, "data": None}, "unavailable"),
            ({"http": 200, "code": 500, "data": None}, "unavailable"),
            ({"http": "200", "code": 400, "data": None}, "malformed"),
            (None, "malformed"),
        ):
            with self.subTest(code=code):
                self.assertEqual(
                    evidence.classify_duplicate_fence(
                        response, inventory, inventory),
                    code)
        changed = dict(inventory, containers=["container", "second"])
        self.assertEqual(
            evidence.classify_duplicate_fence(
                {"http": 200, "code": 400, "data": None}, inventory, changed),
            "inventory-changed")

    def test_vm_ci_duplicate_fence_token_allowlist_and_forgery_rejection(self):
        for label in ("replay", "same-name"):
            for category in ("accepted", "inventory-changed", "unavailable",
                             "malformed"):
                token = label + "-" + category
                self.assertEqual(
                    failure.app_duplicate_fence_code(
                        "G5_APP_DUPLICATE_FENCE_CODE=" + token +
                        " release=NO_GO\n"),
                    token)
        for malicious in (
            "G5_APP_DUPLICATE_FENCE_CODE=replay-denied release=NO_GO\n",
            "G5_APP_DUPLICATE_FENCE_CODE=replay-accepted password=SECRET "
            "release=NO_GO\n",
            "G5_APP_DUPLICATE_FENCE_CODE=replay-accepted release=GO\n",
            "G5_APP_DUPLICATE_FENCE_CODE=replay-accepted release=NO_GO EXTRA\n",
            "G5_APP_DUPLICATE_FENCE_CODE=/etc/passwd release=NO_GO\n",
        ):
            self.assertEqual(failure.app_duplicate_fence_code(malicious),
                             "unknown")

    def test_live_script_probes_duplicate_admission_without_retry(self):
        script = (ROOT / "scripts/install-test/app-install-live.py").read_text()
        self.assertIn('expect_duplicate_denied("replay"', script)
        self.assertIn('expect_duplicate_denied("same-name"', script)
        self.assertIn('"  " + APP_NAME.upper() + "  "', script)
        self.assertIn('"duplicate_fences_observed": True', script)
        self.assertIn(
            'raise RuntimeError("duplicate AppInstall fence did not hold")',
            script)

    def test_live_script_observes_removal_by_payload_not_http_refusal(self):
        script = (ROOT / "scripts/install-test/app-install-live.py").read_text()
        self.assertIn(
            "removal_code = app_evidence_codes.classify_app_install_removal(removal)",
            script)
        self.assertIn('if removal_code != "removed":', script)
        self.assertIn("G5_APP_UNINSTALL_REMOVAL_CODE=", script)
        # The removal read must not demand an HTTP refusal any more.
        self.assertRegex(
            script,
            r'(?s)request\("GET", f"/apps/installed/info/\{install_id\}".*?'
            r"verify_rejection=False")
        self.assertNotRegex(
            script,
            r'(?s)request\("GET", f"/apps/installed/info/\{install_id\}", '
            r'success=False,\s*\n\s*stage_hint')
        # Independent Docker observation of the removed container is retained.
        self.assertIn("AppInstall container remained after uninstall", script)

    def test_live_script_step_labels_match_ci_evidence_contract(self):
        script = (ROOT / "scripts/install-test/app-install-live.py").read_text()
        ci_evidence = (ROOT / "scripts/install-test/ci-evidence.py").read_text()
        script_steps = re.findall(r'steps\.append\("([a-z0-9_]+)"\)', script)
        block = re.search(
            r'"real_local_catalog_sync",(.*?)"fixture_catalog_cleanup",',
            ci_evidence, re.S)
        self.assertIsNotNone(block)
        expected = (
            ["real_local_catalog_sync"]
            + re.findall(r'"([a-z0-9_]+)"', block.group(1))
            + ["fixture_catalog_cleanup"]
        )
        self.assertEqual(script_steps, expected)
        self.assertEqual(
            script_steps,
            ["real_local_catalog_sync",
             "invalid_install_uuid_rejected_without_side_effects",
             "real_appinstall_taskdb_success",
             "independent_running_image_and_network_evidence",
             "replay_install_taskid_denied_without_side_effects",
             "same_name_install_denied_without_side_effects",
             "real_app_uninstall_and_resource_removal",
             "fixture_catalog_cleanup"])



if __name__ == "__main__":
    unittest.main()
