"""Same-candidate proof-screening tests: fake files only; never boot a VM."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "install-test"))
import candidate_identity as ci


class CandidateIdentityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.state = self.root / ".local" / "install-test"
        self.state.mkdir(parents=True)
        self.build = self.root / "build"
        self.build.mkdir()
        for part in ci.PARTS:
            (self.build / ("gpupanel-" + part)).write_bytes(("binary-" + part).encode())
        self.digests = ci.local_build_digests(self.root)
        self.commit = "a" * 40
        self.guest_identity = "b" * 64

    def write_receipts(self):
        browser = {
            "binary_sha256": self.digests,
            "candidate_commit": self.commit,
            "guest_identity_sha256": self.guest_identity,
            "live_login_and_httponly_entrance": True,
            "anonymous_core_host_evidence_denied": True,
            "invalid_csrf_denied": True,
            "live_core_agent_host_api": True,
        }
        runtime = {
            "binary_sha256": self.digests,
            "candidate_commit": self.commit,
            "guest_identity_sha256": self.guest_identity,
            "two_clean_agent_restarts": True,
            "fixture_marker_and_login_settings_retained": True,
            "repeat_install_refused_without_service_restart": True,
        }
        (self.state / "browser-live.json").write_text(json.dumps(browser))
        (self.state / "runtime-live.json").write_text(json.dumps(runtime))
        return browser, runtime

    def review(self):
        with patch.object(ci, "source_checkout_commit", return_value=self.commit):
            return ci.review_candidate(self.root, self.state)

    def test_same_candidate_partial_acceptance_is_not_release(self):
        self.write_receipts()
        reviewed = self.review()
        self.assertTrue(reviewed["candidate_consistent"])
        self.assertFalse(reviewed["m0_release_ready"])
        self.assertEqual(reviewed["g3_install_upgrade_rollback"], "NOT_VERIFIED")
        self.assertEqual(reviewed["g5_full_docker_app_lifecycle"], "NOT_VERIFIED")
        self.assertEqual(reviewed["g6_full_recovery"], "NOT_VERIFIED")

    def test_changed_installed_binary_refuses_mixed_receipts(self):
        b, r = self.write_receipts()
        b["binary_sha256"] = {**self.digests, "agent": "f" * 64}
        (self.state / "browser-live.json").write_text(json.dumps(b))
        with self.assertRaisesRegex(ValueError, "different installed"):
            self.review()

    def test_stale_checkout_refuses_cross_commit_stitching(self):
        b, r = self.write_receipts()
        r["candidate_commit"] = "b" * 40
        (self.state / "runtime-live.json").write_text(json.dumps(r))
        with self.assertRaisesRegex(ValueError, "checkout commit"):
            self.review()

    def test_different_vm_with_identical_binaries_is_rejected(self):
        browser, runtime = self.write_receipts()
        runtime["guest_identity_sha256"] = "c" * 64
        (self.state / "runtime-live.json").write_text(json.dumps(runtime))
        with self.assertRaisesRegex(ValueError, "different guest identities"):
            self.review()

    def test_missing_or_invalid_guest_identity_is_rejected(self):
        browser, runtime = self.write_receipts()
        del browser["guest_identity_sha256"]
        (self.state / "browser-live.json").write_text(json.dumps(browser))
        with self.assertRaisesRegex(ValueError, "guest identity fingerprint"):
            self.review()
        browser["guest_identity_sha256"] = "not-hex"
        (self.state / "browser-live.json").write_text(json.dumps(browser))
        with self.assertRaisesRegex(ValueError, "guest identity fingerprint"):
            self.review()

    def test_guest_identity_is_pseudonymous_and_refuses_unowned_vm(self):
        class VM:
            STATE = Path("/tmp/disposable-fixture")
            def owned_pid(self, *_):
                return 123
            def ssh_args(self):
                return ["ssh", "fixture"]
        from subprocess import CompletedProcess
        machine_id = "1234567890abcdef1234567890abcdef"
        with patch.object(ci.subprocess, "run", return_value=CompletedProcess([], 0, stdout=machine_id + "\\n")):
            fingerprint = ci.guest_identity_fingerprint(VM())
        self.assertRegex(fingerprint, r"^[0-9a-f]{64}$")
        self.assertNotIn(machine_id, fingerprint)
        with patch.object(ci.subprocess, "run", return_value=CompletedProcess([], 0, stdout="invalid")):
            with self.assertRaisesRegex(ValueError, "machine-id"):
                ci.guest_identity_fingerprint(VM())
        class Unowned(VM):
            def owned_pid(self, *_):
                return None
            def ssh_args(self):
                raise AssertionError("must refuse before ssh")
        with self.assertRaisesRegex(RuntimeError, "not running"):
            ci.guest_identity_fingerprint(Unowned())

    def test_missing_required_real_check_denied(self):
        b, r = self.write_receipts()
        b["live_core_agent_host_api"] = "PASS"
        (self.state / "browser-live.json").write_text(json.dumps(b))
        with self.assertRaisesRegex(ValueError, "incomplete"):
            self.review()
        b["live_core_agent_host_api"] = True
        r["fixture_marker_and_login_settings_retained"] = False
        (self.state / "browser-live.json").write_text(json.dumps(b))
        (self.state / "runtime-live.json").write_text(json.dumps(r))
        with self.assertRaisesRegex(ValueError, "incomplete"):
            self.review()

    def test_missing_or_redirected_receipts_denied(self):
        self.write_receipts()
        receipt = self.state / "browser-live.json"
        receipt.unlink()
        with self.assertRaises(FileNotFoundError):
            self.review()
        other = self.state / "other"
        other.write_text("{}")
        receipt.symlink_to(other)
        with self.assertRaisesRegex(ValueError, "real file"):
            self.review()

    def test_digest_shape_and_symlinked_binary_denied(self):
        for value in ({}, {"core": "f" * 64, "agent": "ZZ"}, {"core": "f" * 64, "agent": "a" * 64, "extra": "x"}):
            with self.subTest(value=value), self.assertRaises(ValueError):
                ci.validate_digests(value)
        target = self.build / "gpupanel-core"
        target.unlink()
        target.symlink_to(self.build / "gpupanel-agent")
        with self.assertRaisesRegex(ValueError, "regular file"):
            ci.local_build_digests(self.root)

    def test_guest_requires_owned_vm_before_any_subprocess(self):
        class VM:
            STATE = Path("/tmp/disposable-fixture")
            def owned_pid(self, *_):
                return None
            def ssh_args(self):
                raise AssertionError("unowned VM must never be accessed")
        with self.assertRaisesRegex(RuntimeError, "not running"):
            ci.guest_installed_digests(VM())

    def test_guest_probe_rejects_malformed_result(self):
        class VM:
            STATE = Path("/tmp/disposable-fixture")
            def owned_pid(self, *_):
                return 123
            def ssh_args(self):
                return ["ssh", "fixture"]
        from subprocess import CompletedProcess
        with patch.object(ci.subprocess, "run", return_value=CompletedProcess([], 0, stdout='{"core":"bad","agent":"bad"}')):
            with self.assertRaisesRegex(ValueError, "invalid"):
                ci.guest_installed_digests(VM())


if __name__ == "__main__":
    unittest.main()
