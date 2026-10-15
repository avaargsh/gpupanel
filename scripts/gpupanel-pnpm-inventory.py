"""Conservative read-only metadata inventory for the project's pnpm v9 lock.

Only the emitted lockfile subset is accepted; this is not a general YAML loader
or proof of dependency licenses. Unknown formats fail closed.
"""
import hashlib
import json
from pathlib import Path
import re


def inventory(root: Path) -> dict:
    frontend = root / 'frontend'
    lock = frontend / 'pnpm-lock.yaml'
    if lock.is_symlink() or lock.stat().st_size > 8 * 1024 * 1024:
        raise ValueError('unsafe or oversized pnpm lock')
    data = lock.read_text()
    if not re.search(r"^lockfileVersion: ['\"]?9\.0['\"]?$", data, re.M):
        raise ValueError('unsupported pnpm lockfile version')
    section = importer = group = dependency = None
    specs, packages = {}, []
    for line in data.splitlines():
        if line and not line.startswith(' '):
            section = line.rstrip(':')
        if section == 'importers':
            match = re.fullmatch(r'  ([^ ].*?):(?: \{\})?', line)
            if match:
                importer = match[1].strip("'\"")
                if importer != '.' and (importer.startswith('/') or '..' in Path(importer).parts):
                    raise ValueError('unsafe pnpm importer')
                specs[importer] = {}; group = dependency = None
            match = re.fullmatch(r'    (dependencies|devDependencies|optionalDependencies):', line)
            if match:
                group = match[1]; specs[importer][group] = {}
            match = re.fullmatch(r'      (.+):', line)
            if match and group:
                dependency = match[1].strip("'\"")
            match = re.fullmatch(r'        specifier: (.+)', line)
            if match and group and dependency:
                specs[importer][group][dependency] = match[1].strip("'\"")
        elif section == 'packages':
            match = re.fullmatch(r'  ([^ ].*):', line)
            if match:
                key = match[1].strip("'\"")
                if '@' not in key:
                    raise ValueError('pnpm package without locked version')
                name, version = key.rsplit('@', 1)
                if not name or not version or '/' in version:
                    raise ValueError('invalid pnpm package identity')
                packages.append({'name': name, 'version': version, 'path': key, 'linked': False,
                                 'license_hint': None, 'review': 'THIRD_PARTY_REVIEW'})
    if not specs or not packages:
        raise ValueError('missing pnpm importers/packages')
    manifests = []
    for importer, locked in sorted(specs.items()):
        path = frontend / importer / 'package.json'
        if path.is_symlink() or not path.resolve().is_relative_to(frontend.resolve()):
            raise ValueError('unsafe pnpm manifest')
        manifest = json.loads(path.read_text())
        for group in ('dependencies', 'devDependencies', 'optionalDependencies'):
            if manifest.get(group, {}) != locked.get(group, {}):
                raise ValueError('pnpm manifest/lock specifiers disagree: ' + importer + '/' + group)
        manifests.append({'path': str(path.relative_to(root)), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    return {'package_manager': 'pnpm', 'lockfile_version': '9.0', 'count': len(packages),
            'lock_sha256': hashlib.sha256(lock.read_bytes()).hexdigest(), 'manifests': manifests,
            'missing_license_hints': len(packages), 'packages': packages}
