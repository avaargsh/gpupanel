#!/usr/bin/env python3
"""Repair only the owned disposable VM and prove the real GeoIP download."""
import hashlib
import json
from pathlib import Path
import shlex
import subprocess
import time
import vm

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / '.local/install-test/geoip'
if not vm.owned_pid('qemu.pid', str(vm.STATE / 'disk.qcow2')):
    raise SystemExit('Task-owned VM is not running')


def remote(args, check=True):
    return subprocess.run(vm.ssh_args() + [shlex.join(args)], capture_output=True,
                          text=True, timeout=40, check=check)


def guest_python(source):
    return json.loads(remote(['sudo', 'python3', '-c', source]).stdout)


before = guest_python('''from pathlib import Path
import hashlib,json
p=Path('/opt/gpupanel/geo/GeoIP.mmdb')
assert not p.exists(), 'This probe requires the original missing-database fixture'
print(json.dumps({'core_db_sha256':hashlib.sha256(Path('/opt/gpupanel/db/core.db').read_bytes()).hexdigest()}))
''')
# Stop both services gracefully; preserve existing binaries for operator rollback.
remote(['sudo', 'systemctl', 'stop', 'gpupanel-core', 'gpupanel-agent'])
try:
    for name in ('core', 'agent'):
        binary = ROOT / 'build' / ('gpupanel-' + name)
        subprocess.run(['python3', str(ROOT / 'scripts/install-test/vm.py'), 'copy', str(binary)], check=True)
        remote(['sudo', 'sh', '-c',
                f'mkdir -p /opt/gpupanel/geoip-repair-backup; '
                f'test -e /opt/gpupanel/geoip-repair-backup/gpupanel-{name} || '
                f'cp -p /opt/gpupanel/gpupanel-{name} /opt/gpupanel/geoip-repair-backup/'])
        remote(['sudo', 'install', '-m', '0755', '/tmp/gpupanel-' + name, '/opt/gpupanel/gpupanel-' + name])
finally:
    remote(['sudo', 'systemctl', 'start', 'gpupanel-agent', 'gpupanel-core'])

expected = hashlib.file_digest((STATE / 'GeoIP.mmdb').open('rb'), 'sha256').hexdigest()
result = {'kind': 'LIVE disposable VM binary repair, not an installer upgrade gate',
          'database_source': 'https://resource.fit2cloud.com/1panel/package/v2/geo/GeoIP.mmdb'}
for _ in range(120):
    state = guest_python('''from pathlib import Path
import hashlib,json
p=Path('/opt/gpupanel/geo/GeoIP.mmdb')
print(json.dumps({'exists':p.exists(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else None}))
''')
    if state['exists']:
        assert state['sha256'] == expected, state
        result['database_sha256'] = expected
        break
    time.sleep(1)
else:
    raise RuntimeError('Real runtime download did not publish the expected MMDB within 120s')
result['lookup'] = json.loads(remote(['sudo', '/tmp/geoip-check', '/opt']).stdout)
assert result['lookup']['en'].strip() and result['lookup']['zh'].strip()
remote(['sudo', 'systemctl', 'restart', 'gpupanel-agent', 'gpupanel-core'])
time.sleep(2)
assert json.loads(remote(['sudo', '/tmp/geoip-check', '/opt']).stdout) == result['lookup']
active = remote(['sudo', 'systemctl', 'is-active', 'gpupanel-core', 'gpupanel-agent']).stdout.splitlines()
assert active == ['active', 'active'], active
result['restart_retains_lookup'] = True
result['binary_sha256'] = guest_python('''import hashlib,json
print(json.dumps({name:hashlib.file_digest(open('/opt/gpupanel/gpupanel-'+name,'rb'),'sha256').hexdigest() for name in ('core','agent')}))
''')
for name, digest in result['binary_sha256'].items():
    assert digest == hashlib.file_digest((ROOT / 'build' / ('gpupanel-' + name)).open('rb'), 'sha256').hexdigest()
# The persistent database remains in place; normal startup may update its contents.
result['core_database_present'] = guest_python('''from pathlib import Path
import json
print(json.dumps(Path('/opt/gpupanel/db/core.db').is_file()))
''')
assert result['core_database_present']
(STATE / 'vm.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
