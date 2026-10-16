#!/usr/bin/env python3
"""Quarantine only verified inactive, data-less GPUPanel remnants; preserve originals."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import stat
import subprocess
from datetime import datetime, timezone

PATHS = ['/etc/gpupanel', '/usr/local/bin/pctl', '/usr/local/bin/gpupanel-core',
         '/usr/local/bin/gpupanel-agent', '/etc/systemd/system/gpupanel-core.service',
         '/etc/systemd/system/gpupanel-agent.service']


def snapshot(path):
    info = path.lstat()
    result = {'mode': stat.S_IMODE(info.st_mode), 'uid': info.st_uid, 'gid': info.st_gid,
              'device': info.st_dev, 'inode': info.st_ino}
    assert info.st_uid == 0, 'Non-root owned remnant; manual review required'
    if path.is_symlink():
        result['target'] = os.readlink(path)
        assert result['target'].startswith('/opt/gpupanel/'), 'Foreign symlink target'
    elif path.is_file():
        result['sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
        text = path.read_text()
        assert 'WorkingDirectory=/opt/gpupanel' in text and 'ExecStart=/opt/gpupanel/gpupanel-' in text
    elif path.is_dir():
        assert path == Path('/etc/gpupanel') and {x.name for x in path.iterdir()} <= {'agent.sock'}
        result['children'] = {x.name: snapshot(x) for x in path.iterdir()}
    elif stat.S_ISSOCK(info.st_mode):
        assert path == Path('/etc/gpupanel/agent.sock')
        connection = socket.socket(socket.AF_UNIX)
        connection.settimeout(1)
        try:
            connection.connect(str(path))
        except ConnectionRefusedError:
            result['stale_socket'] = True
        else:
            raise RuntimeError('Socket has a live listener; refuse quarantine')
        finally:
            connection.close()
    else:
        raise RuntimeError('Unexpected remnant type')
    return result


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--apply', action='store_true')
args = parser.parse_args()
assert os.geteuid() == 0, 'Run via sudo'
for name in ['/opt/gpupanel', '/opt/1panel', '/etc/1panel']:
    assert not os.path.lexists(name), 'Existing panel data: stop for migration review'
for name in ('gpupanel-core', 'gpupanel-agent'):
    for prop, expected in [('ActiveState', 'inactive'), ('MainPID', '0'), ('UnitFileState', 'disabled')]:
        actual = subprocess.check_output(['systemctl', 'show', name, '-p', prop, '--value'], text=True).strip()
        assert actual == expected, f'{name} {prop}: {actual}'
items = {name: snapshot(Path(name)) for name in PATHS if os.path.lexists(name)}
print(json.dumps({'verified_stale_paths': list(items), 'mode': 'apply' if args.apply else 'dry-run'}))
if not args.apply:
    raise SystemExit(0)
base = Path('/var/backups/gpupanel')
assert not base.is_symlink()
base.mkdir(mode=0o700, exist_ok=True)
assert base.stat().st_uid == 0
backup = base / ('host-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
backup.mkdir(mode=0o700)
(backup / 'manifest.json').write_text(json.dumps(items, indent=2) + '\n')
(backup / 'manifest.json').chmod(0o600)
# Move across the same filesystem, including the original stale socket inode.
# Perform a complete round trip before the final quarantine.
for round_number in range(2):
    moved = []
    try:
        for name, expected in items.items():
            source = Path(name)
            assert snapshot(source) == expected, 'Remnant changed since inventory'
            target = backup / 'originals' / name.lstrip('/')
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            assert source.lstat().st_dev == target.parent.stat().st_dev, 'Cross-filesystem move refused'
            assert not os.path.lexists(target)
            os.rename(source, target)
            moved.append(name)
        if round_number == 0:
            for name in reversed(moved):
                os.rename(backup / 'originals' / name.lstrip('/'), name)
            moved.clear()
            assert {name: snapshot(Path(name)) for name in items} == items
            (backup / 'restore-verified.json').write_text(json.dumps({'original_inode_and_bytes_restored': True}))
    except Exception:
        for name in reversed(moved):
            if not os.path.lexists(name):
                os.rename(backup / 'originals' / name.lstrip('/'), name)
        raise
subprocess.run(['systemctl', 'daemon-reload'], check=True)
print(json.dumps({'backup': str(backup), 'restore_round_trip_verified': True, 'originals_preserved': True}))
