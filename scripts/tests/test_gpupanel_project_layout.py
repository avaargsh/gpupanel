"""Current directory/documentation and accidental-secret commit guards."""
from pathlib import Path
import re
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[2]


class ProjectLayoutTest(unittest.TestCase):
    def test_private_and_generated_paths_are_ignored_but_sources_are_not(self):
        ignored = ('.local/install-test/credentials.json', '.local/install-test/ubuntu2404/id_ed25519', 'build/candidate.tar.gz', 'dist/gpupanel-preview.tar.gz', 'frontend/apps/panel/.env.local', 'frontend/apps/panel/dist/index.html', 'core/cmd/server/web/assets/generated.js')
        retained = ('frontend/pnpm-lock.yaml', 'frontend/apps/panel/.env.example', 'frontend/apps/panel/.env.production.example', 'core/cmd/server/web/web.go', 'docs/evidence/2026-10-16/local-install/RESULTS.md', 'scripts/install-test/vm.py')
        for names, expected in ((ignored, 0), (retained, 1)):
            for name in names:
                with self.subTest(path=name):
                    result = subprocess.run(['git', 'check-ignore', '--no-index', '-q', name], cwd=ROOT, capture_output=True)
                    self.assertEqual(result.returncode, expected, name)

    def test_owned_documentation_links_resolve(self):
        documents = [ROOT / name for name in ('README.md', 'frontend/README.md', 'deploy/README.md', 'scripts/README.md', 'docs/README.md')]
        documents += list((ROOT / 'docs/engineering').glob('*.md'))
        documents += list((ROOT / 'docs/operations').glob('*.md'))
        documents += list((ROOT / 'docs/evidence').rglob('*.md'))
        for document in documents:
            for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)', document.read_text()):
                if '://' in target or target.startswith(('#', 'mailto:')):
                    continue
                path = target.split('#', 1)[0]
                with self.subTest(document=str(document.relative_to(ROOT)), link=target):
                    self.assertTrue((document.parent / path).resolve().exists(), target)

    def test_curated_evidence_stays_within_budget(self):
        result = subprocess.run(['python3', 'scripts/gpupanel-evidence-budget.py'], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_evidence_budget_rejects_raw_logs_growth_and_missing_summary(self):
        import tempfile
        for scenario in ('raw-log', 'oversize', 'missing-summary', 'too-many-files'):
            with self.subTest(scenario=scenario), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                bundle = root / '2026-10-16' / 'example'
                bundle.mkdir(parents=True)
                if scenario != 'missing-summary':
                    (bundle / 'RESULTS.md').write_text('Historical result with explicit limits.\n')
                if scenario == 'raw-log':
                    (bundle / 'test-output.txt').write_text('Repeated test output')
                elif scenario == 'oversize':
                    (bundle / 'inventory.json').write_bytes(b' ' * (64 * 1024 + 1))
                elif scenario == 'too-many-files':
                    for index in range(8):
                        (bundle / f'receipt-{index}.json').write_text('{}')
                else:
                    (bundle / 'receipt.json').write_text('{}')
                result = subprocess.run(['python3', str(ROOT / 'scripts/gpupanel-evidence-budget.py'), '--root', str(root)], capture_output=True, text=True)
                self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
                self.assertIn('FAIL:', result.stdout)

    def test_vm_is_local_and_owner_checked(self):
        source = (ROOT / 'scripts/install-test/vm.py').read_text()
        self.assertIn('hostfwd=tcp:127.0.0.1:', source)
        self.assertIn('PID identity changed', source)
        self.assertIn('IMAGE_SHA', source)
        self.assertIn('gpgv', source)
        self.assertNotIn('pkill', source)
        self.assertNotIn('/var/run/docker.sock', source)


class VMProcessIdentityTest(unittest.TestCase):
    def test_matching_path_in_unrelated_process_never_authorizes_signal(self):
        import importlib.util
        import tempfile
        from unittest.mock import patch
        spec = importlib.util.spec_from_file_location('gpupanel_vm_test', ROOT / 'scripts/install-test/vm.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory)
            (state / 'qemu.pid').write_text('123')
            marker = str(state / 'disk.qcow2')
            with patch.object(module, 'STATE', state), patch.object(Path, 'read_bytes', return_value=('/usr/bin/python3\0' + marker).encode()):
                with self.assertRaisesRegex(RuntimeError, 'PID identity changed'):
                    module.owned_pid('qemu.pid', marker)
            owned = ('qemu-system-x86_64\0-name\0gpupanel-disposable-install-test\0-drive\0file=' + marker).encode()
            with patch.object(module, 'STATE', state), patch.object(Path, 'read_bytes', return_value=owned):
                self.assertEqual(module.owned_pid('qemu.pid', marker), 123)
