"""Disposable VM same-candidate G4→G6 gate; NO host install occurs."""
import ast
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import types
import unittest

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "scripts/install-test/candidate.py"
spec = importlib.util.spec_from_file_location("gpupanel_vm_candidate", SOURCE)
candidate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(candidate)


class SameCandidateContract(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        build = self.root / "build"
        build.mkdir()
        for name in ("core", "agent"):
            (build / ("gpupanel-" + name)).write_bytes(("fake-" + name).encode())

    def git(self, *, dirty=False):
        def run(args, **kw):
            self.assertEqual(kw["cwd"], self.root)
            self.assertTrue(kw["check"])
            if args == ["git", "rev-parse", "HEAD"]:
                return types.SimpleNamespace(stdout="a" * 40 + "\n")
            if args == ["git", "status", "--porcelain", "--untracked-files=all"]:
                return types.SimpleNamespace(stdout="?? untracked.py\n" if dirty else "")
            raise AssertionError("unexpected git command")
        return run

    def test_same_clean_source_and_both_installed_binaries(self):
        v = candidate.local_candidate(self.root, run=self.git())
        self.assertEqual(v["source_sha"], "a" * 40)
        self.assertEqual(set(v["binary_sha256"]), {"core", "agent"})
        self.assertIs(candidate.verify_installed(v, dict(v["binary_sha256"])), v)

    def test_dirty_checkout_missing_file_and_symlink_cannot_be_verified(self):
        with self.assertRaisesRegex(RuntimeError, "uncommitted or untracked"):
            candidate.local_candidate(self.root, run=self.git(dirty=True))
        link = self.root / "build/gpupanel-core"
        link.unlink()
        link.symlink_to(self.root / "build/gpupanel-agent")
        with self.assertRaisesRegex(RuntimeError, "symlinked"):
            candidate.local_candidate(self.root, run=self.git())
        link.unlink()
        with self.assertRaises(FileNotFoundError):
            candidate.local_candidate(self.root, run=self.git())

    def test_mismatched_partial_or_malformed_installed_artifacts_fail_closed(self):
        v = candidate.local_candidate(self.root, run=self.git())
        good = v["binary_sha256"]
        for invalid in [
            {}, {"core": good["core"]},
            {"core": good["core"], "agent": "0" * 64},
            {"core": good["core"], "agent": True},
            {"core": good["core"], "agent": good["agent"], "other": "0" * 64},
        ]:
            with self.subTest(invalid=invalid), self.assertRaisesRegex(
                RuntimeError, "installed binary|digest"
            ):
                candidate.verify_installed(v, invalid)
        with self.assertRaisesRegex(RuntimeError, "invalid immutable"):
            candidate.verify_installed({**v, "source_sha": "other"}, good)

    def test_browser_acceptance_requires_exact_source_and_all_live_checks(self):
        v = candidate.local_candidate(self.root, run=self.git())
        flags = {
            key: True for key in (
                "anonymous_core_host_evidence_denied",
                "live_login_and_httponly_entrance",
                "live_core_agent_host_api",
                "authenticated_installed_list_read",
                "invalid_csrf_denied",
                "live_operations_center_read_only",
            )
        }
        proof = {"kind": "LIVE local VM; no intercepted APIs",
                 "candidate": v, "browser_page_errors": [], **flags}
        candidate.verify_browser_chain(proof, v)
        variants = [
            {**proof, "kind": "SIMULATED API"},
            {**proof, "candidate": {**v, "source_sha": "b" * 40}},
            {**proof, "live_operations_center_read_only": False},
            {**proof, "invalid_csrf_denied": 1},
            {**proof, "browser_page_errors": ["error"]},
            {key: value for key, value in proof.items()
             if key != "anonymous_core_host_evidence_denied"},
        ]
        for bad in variants:
            with self.subTest(bad=bad), self.assertRaisesRegex(
                RuntimeError, "same-candidate"
            ):
                candidate.verify_browser_chain(bad, v)

    def test_real_browser_and_recovery_scripts_bind_before_effects(self):
        browser = (ROOT / "scripts/install-test/browser.py").read_text()
        runtime = (ROOT / "scripts/install-test/runtime.py").read_text()
        # These scripts are not directly executed by the unprivileged CI.
        # Parse their code and the embedded guest preflight Python so syntax
        # errors cannot first surface during an authorized VM run.
        ast.parse(browser)
        ast.parse(runtime)
        tree = ast.parse(browser)
        probe = next(node.value.value for node in tree.body
                     if isinstance(node, ast.Assign)
                     and any(isinstance(t, ast.Name) and t.id == 'remote_probe'
                             for t in node.targets))
        ast.parse(probe)
        self.assertIn("running service executable differs from installed file", probe)
        self.assertIn("running service executable differs from installed file", runtime)
        self.assertNotIn("page.route(", browser)
        self.assertIn("candidate.verify_installed(local, installed['binary_sha256'])", browser)
        self.assertIn("live_operations_center_read_only", browser)
        self.assertIn("taskHTTP", browser)
        self.assertLess(
            runtime.index("candidate.verify_browser_chain(browser, local)"),
            runtime.index("remote(['sudo', 'systemctl', 'restart'"),
        )
        self.assertLess(
            runtime.index("candidate.verify_installed(local, installed['binary_sha256'])"),
            runtime.index("remote(['sudo', 'systemctl', 'restart'"),
        )


if __name__ == "__main__":
    unittest.main()
