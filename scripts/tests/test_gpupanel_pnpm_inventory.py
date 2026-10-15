from pathlib import Path
import importlib.util
import tempfile
import shutil
import unittest
ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('pnpm_inventory', ROOT / 'scripts/gpupanel-pnpm-inventory.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
class PNPMInventoryTest(unittest.TestCase):
    def test_current_lock_has_no_invented_license_clearance(self):
        result = audit.inventory(ROOT)
        self.assertGreater(result['count'], 0)
        self.assertTrue(all(row['license_hint'] is None for row in result['packages']))
        self.assertEqual(result['package_manager'], 'pnpm')
    def test_manifest_drift_and_unknown_format_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'frontend/apps/panel').mkdir(parents=True)
            for source in ('pnpm-lock.yaml', 'package.json', 'apps/panel/package.json'):
                shutil.copy2(ROOT / 'frontend' / source, root / 'frontend' / source)
            path = root / 'frontend/apps/panel/package.json'
            path.write_text('{"dependencies": {"invented": "*"}}')
            with self.assertRaisesRegex(ValueError, 'disagree'):
                audit.inventory(root)
            lock = root / 'frontend/pnpm-lock.yaml'
            lock.write_text("lockfileVersion: '99.0'\n")
            with self.assertRaisesRegex(ValueError, 'unsupported'):
                audit.inventory(root)
