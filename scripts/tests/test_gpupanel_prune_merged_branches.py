"""Offline negative tests for safe merged-PR ref cleanup."""
from __future__ import annotations

import importlib.util
import pathlib
import sys
import unittest
from unittest.mock import patch

PATH = pathlib.Path(__file__).resolve().parents[1] / "gpupanel-prune-merged-branches.py"
SPEC = importlib.util.spec_from_file_location("gpupanel_branch_prune", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def branch(name, sha="a" * 40, protected=False):
    return {"name": name, "commit": {"sha": sha}, "protected": protected}


def pr(name, number, sha="a" * 40, merged=True, repo="avaargsh/gpupanel"):
    return {"number": number, "head": {"ref": name, "sha": sha, "repo": {"full_name": repo}},
            "merged_at": "2026-10-15T10:00:00Z" if merged else None}


class PruneMergedBranchTest(unittest.TestCase):
    def test_matching_merged_pr_candidate(self):
        items, excluded = MODULE.classify("dev-v2", [branch("feat/done")], [pr("feat/done", 7)])
        self.assertEqual(items, [{"branch": "feat/done", "sha": "a" * 40, "merged_prs": [7]}])
        self.assertEqual(excluded, {})

    def test_default_and_protected_are_never_eligible(self):
        items, excluded = MODULE.classify("dev-v2", [branch("dev-v2"), branch("feat/x", protected=True)],
                                          [pr("dev-v2", 1), pr("feat/x", 2)])
        self.assertEqual(items, [])
        self.assertEqual(len(excluded), 2)

    def test_open_and_closed_unmerged_prs_block_even_if_other_pr_merged(self):
        items, excluded = MODULE.classify("dev-v2", [branch("feat/x")],
                                          [pr("feat/x", 7), pr("feat/x", 8, merged=False)])
        self.assertEqual(items, [])
        self.assertIn("unmerged", excluded["feat/x"])

    def test_stale_head_and_missing_pr_fail_closed(self):
        items, excluded = MODULE.classify("dev-v2", [branch("feat/x"), branch("feat/missing")],
                                          [pr("feat/x", 1, sha="b" * 40)])
        self.assertEqual(items, [])
        self.assertEqual(len(excluded), 2)

    def test_foreign_repo_pr_cannot_authorize_delete(self):
        items, _ = MODULE.classify("dev-v2", [branch("feat/x")],
                                   [pr("feat/x", 3, repo="other/repo")])
        self.assertEqual(items, [])

    def test_invalid_sha_is_blocked(self):
        with self.assertRaisesRegex(RuntimeError, "Invalid branch"):
            MODULE.classify("dev-v2", [branch("feat/x", sha="bad")], [])

    def test_delete_uses_exact_sha_lease_and_no_shell(self):
        item = {"branch": "feat/ok", "sha": "f" * 40, "merged_prs": [9]}
        with patch.object(MODULE, "command", return_value="ok") as call:
            MODULE.delete_exact_head(item)
            argv = call.call_args.args[0]
            self.assertEqual(argv[-2:], ["origin", ":refs/heads/feat/ok"])
            self.assertIn("--force-with-lease=refs/heads/feat/ok:" + "f" * 40, argv)
            self.assertNotIn("--force", argv)


if __name__ == "__main__":
    unittest.main()
