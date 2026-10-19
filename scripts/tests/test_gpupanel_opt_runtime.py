"""Developer-only install layout: no globally installed GPUPanel compatibility aliases.

This is a static/no-root contract. It does not claim real guest upgrade
or recovery acceptance and never runs the installer on the test machine.
"""
from pathlib import Path
import re
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[2]
SHIPPED = (
    "deploy/install.sh",
    "deploy/uninstall.sh",
    "deploy/pctl",
    "deploy/build.sh",
    "core/app/service/upgrade.go",
    "core/init/geo/lang.go",
    "agent/init/lang/lang.go",
)


class OptOnlyRuntimeLayout(unittest.TestCase):
    def test_global_compatibility_link_creation_is_absent(self):
        install = (ROOT / "deploy/install.sh").read_text(encoding="utf-8")
        self.assertNotIn("ln -sfn", install)
        self.assertNotIn('BIN_DIR="/usr/local/bin"', install)
        self.assertIn('install -m 0755 "$CORE_SRC" "$PANEL_DIR/gpupanel-core"', install)
        self.assertIn('install -m 0755 "$AGENT_SRC" "$PANEL_DIR/gpupanel-agent"', install)
        self.assertIn('install -m 0700 "$PCTL_SRC" "$PANEL_DIR/pctl"', install)
        self.assertIn('"$PANEL_DIR/pctl" start', install)
        self.assertIn('log "  control      : $PANEL_DIR/pctl start', install)
        self.assertNotIn('OLD_PCTL="$BIN_DIR/pctl"', install)
        uninstaller = (ROOT / "deploy/uninstall.sh").read_text(encoding="utf-8")
        self.assertNotIn('BIN_DIR=', uninstaller)
        self.assertNotIn('for link in pctl gpupanel-core gpupanel-agent', uninstaller)
        self.assertNotIn('readlink -f "$BIN_DIR', uninstaller)

    def test_no_executable_reference_to_global_panel_or_lang_paths(self):
        for filename in SHIPPED:
            source = (ROOT / filename).read_text(encoding="utf-8")
            if filename.endswith(".go"):
                # Include Go comments to prevent regression into legacy code.
                executable = source
            else:
                executable = "\n".join(
                    line for line in source.splitlines()
                    if not line.lstrip().startswith("#")
                )
            with self.subTest(filename=filename):
                for old in (
                    "/usr/local/bin/pctl",
                    "/usr/local/bin/gpupanel-core",
                    "/usr/local/bin/gpupanel-agent",
                    "/usr/local/bin/lang",
                ):
                    self.assertNotIn(old, executable)
        core_upgrade = (ROOT / "core/app/service/upgrade.go").read_text(encoding="utf-8")
        self.assertIn('path.Join(global.CONF.Base.InstallDir, "gpupanel/lang")', core_upgrade)
        self.assertIn('svcInfo.coreBinary', core_upgrade)
        self.assertIn('svcInfo.agentBinary', core_upgrade)
        for f in ("core/init/geo/lang.go", "agent/init/lang/lang.go"):
            self.assertIn('path.Join(global.CONF.Base.InstallDir, "gpupanel/lang.tar.gz")',
                          (ROOT / f).read_text(encoding="utf-8"))

    def test_bash_scripts_are_syntactically_valid_without_host_mutation(self):
        for filename in ("deploy/install.sh", "deploy/uninstall.sh",
                         "deploy/pctl", "deploy/build.sh"):
            with self.subTest(filename=filename):
                result = subprocess.run(["bash", "-n", str(ROOT / filename)],
                                        capture_output=True, text=True, check=False)
                self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
