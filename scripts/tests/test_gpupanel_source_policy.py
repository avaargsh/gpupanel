# Copyright 2026 GPUPanel contributors
# SPDX-License-Identifier: Apache-2.0
# See LICENSES/Apache-2.0.txt for the license terms.

"""Synthetic git fixture tests for scripts/gpupanel-source-policy.py.

Every fixture is a throwaway repository created under a temporary directory.
The policy checker is executed as a real CLI so exit codes, layer labels and
read-only behavior are observed end to end.
"""
from __future__ import annotations

import hashlib
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "gpupanel-source-policy.py"
spec = importlib.util.spec_from_file_location("gpupanel_source_policy", SCRIPT)
policy = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = policy  # required for @dataclass annotation resolution
spec.loader.exec_module(policy)


def body(count: int, prefix: str = "line") -> str:
    """Exactly *count* physical lines, each terminated by a newline."""
    return "".join(f"{prefix} {index}\n" for index in range(count))


class PolicyFixtureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "repo"
        self.root.mkdir()
        self.git("init", "-q", "-b", "main")
        self.git("config", "user.email", "fixture@example.invalid")
        self.git("config", "user.name", "Policy Fixture")
        self.git("config", "commit.gpgsign", "false")
        self.write("README.md", "fixture repository\n")
        self.commit_all("baseline")
        self.base = self.git("rev-parse", "HEAD").strip()

    # -- fixture helpers -------------------------------------------------
    def git(self, *args: str) -> str:
        proc = subprocess.run(
            ["git", "-C", str(self.root), *args],
            capture_output=True,
            text=True,
            check=True,
        )
        return proc.stdout

    def write(self, rel: str, text: str) -> Path:
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return path

    def commit_all(self, message: str) -> None:
        self.git("add", "-A")
        self.git("commit", "-q", "-m", message)

    def run_policy(self, *extra: str, base: str | None = None):
        proc = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--repo",
                str(self.root),
                "--base",
                self.base if base is None else base,
                *extra,
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        return proc.returncode, proc.stdout, proc.stderr

    def snapshot(self) -> tuple[str, str, dict[str, str]]:
        """HEAD, porcelain status and content digest of every worktree file."""
        head = self.git("rev-parse", "HEAD").strip()
        status = self.git("status", "--porcelain=v1", "-uall")
        digest: dict[str, str] = {}
        for path in sorted(self.root.rglob("*")):
            if not path.is_file() or ".git" in path.parts:
                continue
            digest[str(path.relative_to(self.root))] = hashlib.sha256(
                path.read_bytes()
            ).hexdigest()
        return head, status, digest

    # -- commit-diff layer ----------------------------------------------
    def test_added_source_within_limit_passes(self):
        self.write("backend/small.go", body(500))
        self.commit_all("add small source")
        code, out, err = self.run_policy()
        self.assertEqual(code, 0, out + err)
        self.assertIn("failed=0", out)
        self.assertIn("commit_added=1", out)
        self.assertIn("PASSED", out)

    def test_added_source_over_limit_fails(self):
        self.write("backend/big.go", body(501))
        self.commit_all("add oversized source")
        code, out, err = self.run_policy()
        self.assertEqual(code, 1, out + err)
        self.assertIn("path=backend/big.go layer=commit", out)
        self.assertIn("lines=501", out)
        self.assertIn("failed=1", out)
        self.assertIn("FAILED", out)

    def test_oversized_rename_does_not_bypass_new_path_rule(self):
        self.write("core/legacy.go", body(600))
        self.commit_all("legacy file in baseline")
        self.base = self.git("rev-parse", "HEAD").strip()
        (self.root / "backend").mkdir()
        self.git("mv", "core/legacy.go", "backend/moved.go")
        self.commit_all("rename legacy file")
        code, out, err = self.run_policy()
        self.assertEqual(code, 1, out + err)
        self.assertIn("path=backend/moved.go layer=commit", out)
        self.assertIn("lines=600", out)
        self.assertIn("path=core/legacy.go layer=commit-legacy-origin", out)

    def test_existing_oversized_tracked_debt_is_informational(self):
        self.write("agent/legacy_utils.go", body(601))
        self.commit_all("legacy debt in baseline")
        self.base = self.git("rev-parse", "HEAD").strip()
        code, out, err = self.run_policy()
        self.assertEqual(code, 0, out + err)
        self.assertIn("failed=0", out)
        self.assertIn("path=agent/legacy_utils.go layer=tracked-legacy-working-tree", out)
        self.assertIn("lines=601", out)
        self.assertIn("legacy_oversized=1", out)
        self.assertIn("informational legacy debt, not a failure", out)

    def test_modified_existing_source_over_limit_never_fails(self):
        self.write("core/grower.go", body(400))
        self.commit_all("baseline grower")
        self.base = self.git("rev-parse", "HEAD").strip()
        self.write("core/grower.go", body(700))
        self.commit_all("grow existing file")
        code, out, err = self.run_policy()
        self.assertEqual(code, 0, out + err)
        self.assertIn("failed=0", out)
        self.assertIn("commit_added=0", out)

    def test_paths_with_spaces_are_handled_exactly(self):
        self.write("backend/my pkg/small.go", body(10))
        self.write("backend/my pkg/huge.go", body(600))
        self.commit_all("paths with spaces")
        code, out, err = self.run_policy()
        self.assertEqual(code, 1, out + err)
        self.assertIn("path=backend/my pkg/huge.go layer=commit", out)
        self.assertIn("path=backend/my pkg/small.go layer=commit", out)
        self.assertIn("failed=1", out)

    def test_test_sources_are_not_exempt(self):
        self.write("backend/service_test.go", body(600))
        self.commit_all("oversized test file")
        code, out, err = self.run_policy()
        self.assertEqual(code, 1, out + err)
        self.assertIn("path=backend/service_test.go layer=commit", out)

    # -- baseline handling ----------------------------------------------
    def test_invalid_baseline_ref_fails_closed(self):
        self.write("backend/big.go", body(600))
        self.commit_all("add source")
        code, out, err = self.run_policy(base="no-such-baseline-ref")
        self.assertEqual(code, 2)
        self.assertIn("invalid or missing baseline", err)
        self.assertIn("empty tree", err)
        self.assertNotIn("failed=", out)

    def test_missing_base_argument_is_a_usage_error(self):
        proc = subprocess.run(
            [sys.executable, str(SCRIPT), "--repo", str(self.root)],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(proc.returncode, 2)
        self.assertIn("--base", proc.stderr)

    # -- working-tree layers --------------------------------------------
    def test_untracked_layer_is_opt_in_and_labeled(self):
        self.write("backend/untracked_big.go", body(600))
        code, out, err = self.run_policy()
        self.assertEqual(code, 0, out + err)
        self.assertIn("layers=commit\n", out)
        self.assertNotIn("layer=worktree-untracked", out)
        self.assertIn("failed=0", out)

        code, out, err = self.run_policy("--include-worktree")
        self.assertEqual(code, 1, out + err)
        self.assertIn("path=backend/untracked_big.go layer=worktree-untracked", out)
        self.assertIn("index-staged", out)
        self.assertIn("not interchangeable claims", out)

    def test_staged_new_file_detected_in_index_layer(self):
        self.write("backend/staged_big.go", body(600))
        self.git("add", "backend/staged_big.go")
        code, out, err = self.run_policy()
        self.assertEqual(code, 0, out + err)
        self.assertNotIn("layer=index-staged", out)

        code, out, err = self.run_policy("--include-worktree")
        self.assertEqual(code, 1, out + err)
        self.assertIn("path=backend/staged_big.go layer=index-staged", out)
        self.assertIn("failed=1", out)

    # -- narrow exclusion contract --------------------------------------
    def test_arbitrary_generated_tag_does_not_evade_gate(self):
        self.write("backend/tagged.go", "// @generated business source\n" + body(600, "x"))
        self.write("backend/tagged_two.py", "# Code generated by hand; DO NOT EDIT.\n" + body(600, "y"))
        self.commit_all("tagged business source")
        code, out, err = self.run_policy()
        self.assertEqual(code, 1, out + err)
        self.assertIn("path=backend/tagged.go layer=commit", out)
        self.assertIn("path=backend/tagged_two.py layer=commit", out)
        self.assertIn("failed=2", out)

    def test_generated_filename_suffix_is_excluded_by_contract(self):
        self.write("backend/api.pb.go", body(600))
        self.write("backend/schema_pb2.py", body(600))
        self.commit_all("protobuf generated output")
        code, out, err = self.run_policy()
        self.assertEqual(code, 0, out + err)
        self.assertIn("path=backend/api.pb.go layer=commit", out)
        self.assertIn("excluded by narrow contract (generated-filename)", out)
        self.assertIn("candidates_excluded=2", out)
        self.assertIn("failed=0", out)

    def test_vendor_directory_is_excluded_not_failed(self):
        self.write("vendor/bigdep/impl.go", body(600))
        self.commit_all("vendored source")
        code, out, err = self.run_policy()
        self.assertEqual(code, 0, out + err)
        self.assertIn("excluded by narrow contract (excluded-directory)", out)
        self.assertIn("failed=0", out)

    def test_lock_filenames_are_excluded_by_contract(self):
        self.assertTrue(policy.exclusion_reason("frontend/pnpm-lock.yaml") == "lockfile")
        self.assertTrue(policy.exclusion_reason("pkg/thing.lock") == "lockfile")
        self.assertIsNone(policy.exclusion_reason("pkg/thing.go"))

    # -- path-safety denials --------------------------------------------
    def test_sibling_prefix_symlink_escape_is_denied(self):
        # A symlink whose name is inside the repo but whose real target lives in
        # a sibling directory that merely shares the repo path as a prefix.
        sibling = Path(self.temp.name) / (Path(self.root).name + "-other")
        sibling.mkdir()
        secret = sibling / "secret.go"
        secret.write_text(body(600), encoding="utf-8")
        os.symlink(secret, self.root / "evil.go")
        code, out, err = self.run_policy("--include-worktree")
        self.assertEqual(code, 2, out + err)
        self.assertIn("escapes repository working tree", err)
        self.assertNotIn("failed=", out)
        # The private sibling file must never be read or summarized.
        self.assertNotIn("lines=600", out)

    def test_fifo_denied_without_blocking(self):
        # git ls-files never lists FIFOs, so drive the working-tree read path
        # directly: denial must happen before any open(), which cannot block.
        os.mkfifo(self.root / "pipe.go")
        with self.assertRaises(policy.PolicyError) as ctx:
            policy.worktree_bytes(self.root, "pipe.go")
        self.assertIn("not a regular file", str(ctx.exception))
        # A tracked regular file swapped for a FIFO in the working tree must
        # not block the legacy scan either (skipped before open).
        self.write("agent/fswap.go", body(20))
        self.commit_all("regular file")
        (self.root / "agent/fswap.go").unlink()
        os.mkfifo(self.root / "agent/fswap.go")
        code, out, err = self.run_policy("--include-worktree")
        self.assertIn(code, (0, 2), out + err)
        self.assertNotIn("path=agent/fswap.go layer=worktree-untracked", out)

    # -- guarantees ------------------------------------------------------
    def test_run_is_read_only_and_deterministic(self):
        self.write("backend/small.go", body(20))
        self.commit_all("small source")
        before = self.snapshot()
        code, out, err = self.run_policy("--include-worktree")
        self.assertEqual(code, 0, out + err)
        after = self.snapshot()
        self.assertEqual(before, after, "policy run must not modify the repository")
        second_code, second_out, second_err = self.run_policy("--include-worktree")
        self.assertEqual((second_code, second_out, second_err), (code, out, err))

    def test_physical_line_counter_matches_git_blob_content(self):
        data = body(501).encode("utf-8")
        self.assertEqual(policy.physical_lines(data), 501)
        self.assertEqual(policy.physical_lines(b""), 0)
        self.assertEqual(policy.physical_lines(b"no trailing newline"), 1)
        # newline-only content counts every physical line
        self.assertEqual(policy.physical_lines(b"\n" * 500), 500)
        self.assertEqual(policy.physical_lines(b"\n"), 1)
        # missing final newline still counts the last physical line
        self.assertEqual(policy.physical_lines(b"a\nb\nc"), 3)
        self.assertEqual(policy.physical_lines(b"a\nb\nc\n"), 3)


if __name__ == "__main__":
    unittest.main()
