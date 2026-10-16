"""Native shadcn/Tailwind migration contract; no legacy facade or ignored types."""
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
PANEL = ROOT / 'frontend/apps/panel'


class NativeUIStackContract(unittest.TestCase):
    def test_native_registry_and_tailwind_are_configured(self):
        config = json.loads((PANEL / 'components.json').read_text())
        self.assertEqual(config['style'], 'radix-nova')
        self.assertEqual(config['aliases']['ui'], '@/components/ui')
        self.assertEqual(config['tailwind']['css'], 'src/theme/globals.css')
        self.assertIn('tailwindcss()', (PANEL / 'vite.config.ts').read_text())
        css = (PANEL / config['tailwind']['css']).read_text()
        self.assertIn('@import "tailwindcss"', css)
        self.assertIn('--primary:', css)

    def test_semantic_components_replace_legacy_runtime_and_tokens(self):
        manifest = json.loads((PANEL / 'package.json').read_text())
        dependencies = {**manifest.get('dependencies', {}), **manifest.get('devDependencies', {})}
        for name in dependencies:
            self.assertFalse(name.startswith('@douyinfe/semi-'), name)
        violations = []
        for path in (PANEL / 'src').rglob('*'):
            if path.is_file() and path.suffix in ('.ts', '.tsx', '.css'):
                text = path.read_text()
                if re.search(r'@douyinfe/semi-|--semi-|\bsemi-[a-z]', text):
                    violations.append(str(path.relative_to(PANEL)))
        self.assertEqual(violations, [], 'Legacy UI remains: ' + ', '.join(violations))

    def test_ui_primitives_do_not_accept_legacy_facade_props(self):
        for path in (PANEL / 'src/components/ui').glob('*.tsx'):
            source = path.read_text()
            self.assertNotRegex(source, re.compile(r'^\s*(?:visible|okText|cancelText|dataSource|optionList|htmlType|headerExtraContent)\??\s*:', re.MULTILINE), str(path))
            self.assertNotIn('@ts-ignore', source)
            self.assertNotIn('@ts-nocheck', source)
