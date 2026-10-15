"""Source-level regression guards only; never execute the system installer here."""
from pathlib import Path
import unittest
ROOT = Path(__file__).resolve().parents[2]
class LocalDeployContract(unittest.TestCase):
    def test_preflight_precedes_host_mutation_and_private_log_never_retains_password(self):
        src = (ROOT / 'deploy/install.sh').read_text()
        self.assertLess(src.index('python3 "$PREFLIGHT" --json'), src.index('mkdir -p "$PANEL_DIR"'))
        self.assertNotIn('pkill', '\n'.join(line for line in src.splitlines() if not line.startswith('#')))
        self.assertIn('chmod 0600 "$LOG_FILE"', src)
        self.assertIn('umask 077', src)
        self.assertNotIn('log "  password     : $PASSWORD"', src)
        self.assertIn('install -m 0700 "$PCTL_SRC"', src)
    def test_package_preserves_attribution_and_ships_collision_checker(self):
        src = (ROOT / 'deploy/build.sh').read_text()
        self.assertIn('"$ROOT/LICENSE" "$ROOT/NOTICE.md"', src)
        self.assertIn('"$PKG_DIR/gpupanel-install-preflight.py"', src)
