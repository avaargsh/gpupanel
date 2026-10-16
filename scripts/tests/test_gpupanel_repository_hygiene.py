"""Current-status, evidence, attribution and deprecated-skill guards (no host mutation)."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]


class RepositoryHygiene(unittest.TestCase):
    def test_no_retired_semi_skills(self):
        self.assertFalse((ROOT / ".skills").exists())

    def test_single_current_status_entry(self):
        status = (ROOT / "docs/STATUS.md").read_text(encoding="utf-8")
        for marker in ("NO-GO", "PARTIAL", "GPL-3.0"):
            self.assertIn(marker, status)
        for name in ("README.md", "docs/README.md", "docs/evidence/README.md"):
            self.assertIn("STATUS.md", (ROOT / name).read_text(encoding="utf-8"))

    def test_prune_unpinned_history_only(self):
        self.assertFalse((ROOT / "docs/evidence/2026-10-15/remote-integration").exists())
        self.assertTrue((ROOT / "docs/evidence/2026-10-16/local-install/RESULTS.md").is_file())

    def test_legal_attribution_and_runtime_guards_remain(self):
        self.assertIn("GNU GENERAL PUBLIC LICENSE", (ROOT / "LICENSE").read_text(encoding="utf-8"))
        self.assertIn("1Panel", (ROOT / "NOTICE.md").read_text(encoding="utf-8"))
        self.assertTrue((ROOT / "agent/app/service/legacy_catalog.go").exists())
        self.assertTrue((ROOT / "core/app/auth/api_key_legacy_lock.go").exists())


if __name__ == "__main__":
    unittest.main()
