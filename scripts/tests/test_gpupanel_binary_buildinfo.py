"""Synthetic Git+preview fixtures, no Go toolchain or downloaded packages needed."""
from __future__ import annotations

import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "gpupanel-binary-buildinfo.py"
spec = importlib.util.spec_from_file_location("gpupanel_binary_info", SCRIPT)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

CORE = """file: go1.26.6
\tpath\tgithub.com/1Panel-dev/1Panel/core/cmd/server
\tmod\tgithub.com/1Panel-dev/1Panel/core\t(devel)
\tdep\tgithub.com/example/coredep\tv1.2.3\th1:fake
\tbuild\t-compiler=gc
"""
AGENT = """file: go1.26.6
\tpath\tgithub.com/1Panel-dev/1Panel/agent/cmd/server
\tmod\tgithub.com/1Panel-dev/1Panel/agent\t(devel)
\tdep\tgithub.com/go-acme/lego/v5\tv5.3.1\th1:fake
\t=>\tgithub.com/1Panel-dev/lego/v5\tv5.3.1\th1:fake
\tbuild\t-compiler=gc
"""


class BinaryInventoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        self.git("init", "-q")
        self.git("config", "user.name", "Fixture")
        self.git("config", "user.email", "fixture@example.invalid")
        self.write("LICENSE", "GNU GENERAL PUBLIC LICENSE\nVersion 3\n")
        self.git("add", ".")
        self.git("commit", "-qm", "upstream")
        self.base = self.git("rev-parse", "HEAD").strip()
        self.write("NOTICE.md", "1Panel contributors GPL-3.0\n")
        self.write("core/go.mod", "module github.com/1Panel-dev/1Panel/core\n\ngo 1.26.6\n")
        self.write("agent/go.mod", "module github.com/1Panel-dev/1Panel/agent\n\ngo 1.26.6\n")
        self.git("add", ".")
        self.git("commit", "-qm", "fork")
        self.commit = self.git("rev-parse", "HEAD").strip()
        stage = self.root / "stage"
        for name in ("bin/gpupanel-core", "bin/gpupanel-agent"):
            f = stage / name
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_bytes(b"fake binary")
        (stage / "LICENSE").write_bytes((self.repo / "LICENSE").read_bytes())
        (stage / "NOTICE.md").write_bytes((self.repo / "NOTICE.md").read_bytes())
        self.archive = self.root / "preview.tar.gz"
        audit.attestation.release.package(
            stage, self.archive, "dev",
            {"source_commit": self.commit, "production_install_ready": False})

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.repo,
                              check=True, capture_output=True, text=True).stdout

    def write(self, name, content):
        dest = self.repo / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(content)

    def inspect(self, core=CORE, agent=AGENT):
        with patch.object(audit, "run_buildinfo",
                          side_effect=lambda _path, name:
                          core if name.endswith("gpupanel-core") else agent):
            return audit.inspect(self.repo, self.archive, self.base)

    def test_both_binaries_match_committed_modules(self):
        result = self.inspect()
        self.assertEqual(result["result"], "GO_BINARY_MODULE_METADATA_MATCHES_SOURCE")
        self.assertEqual(result["binaries"]["core"]["dependency_count"], 1)
        self.assertEqual(result["binaries"]["agent"]["dependencies"][0]["review"],
                         "REPLACEMENT_REVIEW")
        self.assertEqual(result["binaries"]["agent"]["dependencies"][0]["replacement"]["module_or_path"],
                         "github.com/1Panel-dev/lego/v5")
        self.assertFalse("Apache-2.0_eligibility" not in result["not_proven"])

    def test_main_module_mismatch_rejected(self):
        with self.assertRaisesRegex(audit.InventoryError, "main module differs"):
            self.inspect(core=CORE.replace("mod\tgithub.com/1Panel-dev/1Panel/core",
                                           "mod\tgithub.com/other/core"))

    def test_entrypoint_mismatch_rejected(self):
        with self.assertRaisesRegex(audit.InventoryError, "entrypoint differs"):
            self.inspect(agent=AGENT.replace("agent/cmd/server", "agent/cmd/other"))

    def test_missing_module_and_go_version_rejected(self):
        with self.assertRaisesRegex(audit.InventoryError, "missing Go main module"):
            self.inspect(core=CORE.replace("\tmod\t", "\txxx\t"))
        with self.assertRaisesRegex(audit.InventoryError, "missing Go toolchain"):
            self.inspect(core=CORE.replace("go1.26.6", "unknown"))

    def test_duplicate_module_and_orphan_replacement_rejected(self):
        with self.assertRaisesRegex(audit.InventoryError, "duplicate Go module"):
            self.inspect(core=CORE + "\tmod\tanother/path\t(devel)\n")
        with self.assertRaisesRegex(audit.InventoryError, "orphan Go replacement"):
            self.inspect(agent=AGENT.replace(
                "\tdep\tgithub.com/go-acme/lego/v5\tv5.3.1\th1:fake\n", ""))

    def test_corrupt_archive_fails_before_go_tool(self):
        self.archive.write_bytes(b"not a tar.gz")
        with patch.object(audit, "run_buildinfo") as mocked:
            with self.assertRaisesRegex(audit.InventoryError, "attestation failed"):
                audit.inspect(self.repo, self.archive, self.base)
            mocked.assert_not_called()

    def test_changed_source_module_detected(self):
        self.write("core/go.mod", "module github.com/another/core\n")
        self.git("add", ".")
        self.git("commit", "-qm", "change after package")
        # The archive is bound to its original commit, not to current worktree.
        self.assertEqual(self.inspect()["source_commit"], self.commit)

    def test_missing_go_tool_fails_closed(self):
        with patch("subprocess.run", side_effect=FileNotFoundError):
            with self.assertRaisesRegex(audit.InventoryError, "go version"):
                audit.run_buildinfo(Path("/unused"), "bin/gpupanel-core")

    def test_cli_writes_machine_report(self):
        output = self.root / "report.json"
        with patch.object(audit, "run_buildinfo",
                          side_effect=lambda _path, name:
                          CORE if name.endswith("gpupanel-core") else AGENT):
            code = audit.main(["--repo", str(self.repo), "--archive", str(self.archive),
                               "--baseline", self.base, "--output", str(output)])
        self.assertEqual(code, 0)
        self.assertIn('"source_commit"', output.read_text())
        self.assertEqual(self.git("status", "--porcelain"), "")


if __name__ == "__main__":
    unittest.main()
