"""Guard copyable installation instructions against install-then-uninstall sequences."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
DOCS = ("catalog/README.md", "docs/gpupanel/GETTING_STARTED.zh-CN.md",
        "docs/gpupanel/GETTING_STARTED.md", "docs/gpupanel/PREVIEW_STAGING.md")


class InstallationCopySafety(unittest.TestCase):
    def test_no_code_block_combines_creation_and_removal(self):
        for filename in DOCS:
            source = (ROOT / filename).read_text(encoding="utf-8")
            delimiter = chr(96) * 3
            for block in source.split(delimiter)[1::2]:
                create = ("catalog-workspace.py install --approve" in block
                          or "preview-stage.py stage " in block)
                delete = ("catalog-workspace.py uninstall --approve" in block
                          or "preview-stage.py remove " in block)
                with self.subTest(filename=filename):
                    self.assertFalse(create and delete, "paste-all would create and delete in one step")

    def test_source_archive_never_claimed_as_service_installer(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("GPUPanel system installation", readme)
        self.assertIn("BLOCKED", readme)
        preview = (ROOT / "docs/gpupanel/PREVIEW_STAGING.md").read_text(encoding="utf-8")
        self.assertIn("not a system installation", preview.lower())
        self.assertIn("publisher signature", preview.lower())


if __name__ == "__main__":
    unittest.main()
