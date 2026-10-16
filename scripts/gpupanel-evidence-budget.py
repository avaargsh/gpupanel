#!/usr/bin/env python3
"""Read-only bounds for curated acceptance materials, not proof of test execution."""
import argparse
from pathlib import Path

TOTAL_BYTES = 1024 * 1024
BUNDLE_BYTES = 256 * 1024
TEXT_BYTES = 64 * 1024
MAX_BUNDLES = 8
MAX_FILES = 8
MAX_PNGS = 2
ALLOWED = {'.md', '.json', '.sha256', '.png'}


def check(root):
    errors, bundles = [], {}
    total, count, pngs = 0, 0, 0
    if not root.is_dir() or root.is_symlink():
        return ['evidence root must be a real directory'], 0, 0
    for path in sorted(root.rglob('*')):
        relative = path.relative_to(root)
        if path.is_symlink():
            errors.append(f'{relative}: symlinks are not retained evidence')
            continue
        if not path.is_file():
            continue
        count += 1
        size = path.stat().st_size
        total += size
        if path.suffix not in ALLOWED:
            errors.append(f'{relative}: retain a summary instead of this artifact type')
        limit = BUNDLE_BYTES if path.suffix == '.png' else TEXT_BYTES
        if size > limit:
            errors.append(f'{relative}: {size} bytes exceeds file limit {limit}')
        if path.suffix == '.png':
            pngs += 1
        if relative == Path('README.md'):
            continue
        if len(relative.parts) != 3:
            errors.append(f'{relative}: expected <date>/<topic>/<file>')
        files, byte_count = bundles.get(path.parent, (0, 0))
        bundles[path.parent] = (files + 1, byte_count + size)
    for bundle, (files, size) in bundles.items():
        label = bundle.relative_to(root)
        if not (bundle / 'RESULTS.md').is_file():
            errors.append(f'{label}: RESULTS.md is required')
        if files > MAX_FILES or size > BUNDLE_BYTES:
            errors.append(f'{label}: {files} files / {size} bytes exceeds bundle budget')
    if len(bundles) > MAX_BUNDLES:
        errors.append(f'{len(bundles)} bundles exceeds limit {MAX_BUNDLES}; consolidate older results')
    if pngs > MAX_PNGS:
        errors.append(f'{pngs} PNGs exceeds limit {MAX_PNGS}')
    if total > TOTAL_BYTES:
        errors.append(f'{total} bytes exceeds total budget {TOTAL_BYTES}')
    return errors, count, total


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1] / 'docs/evidence')
    args = parser.parse_args()
    errors, count, total = check(args.root)
    for error in errors:
        print('FAIL: ' + error)
    if errors:
        return 1
    print(f'PASS: {count} evidence files, {total} / {TOTAL_BYTES} bytes')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
