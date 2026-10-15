#!/usr/bin/env python3
"""Read-only host invariants after the owned install/browser lifecycle run."""
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import socket
import sqlite3
import subprocess

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / '.local/host-install'
assert os.geteuid() == 0, 'Run via sudo; do not relax runtime permissions'
result = {'kind': 'LIVE bare-metal read-only final checks', 'binary_sha256': {}}
for name in ('core', 'agent'):
    installed = Path('/opt/gpupanel/gpupanel-' + name)
    digest = hashlib.sha256(installed.read_bytes()).hexdigest()
    assert digest == hashlib.sha256((ROOT / 'build' / installed.name).read_bytes()).hexdigest()
    pid = subprocess.check_output(['systemctl', 'show', 'gpupanel-' + name, '-p', 'MainPID', '--value'], text=True).strip()
    assert pid != '0' and Path('/proc/' + pid + '/exe').resolve() == installed
    result['binary_sha256'][name] = digest
connection = http.client.HTTPConnection('unix', timeout=3)
stream = socket.socket(socket.AF_UNIX)
stream.settimeout(3)
stream.connect('/etc/gpupanel/agent.sock')
connection.sock = stream
connection.request('GET', '/api/v1/health/check')
response = connection.getresponse()
assert response.status == 200 and json.loads(response.read(4096))['code'] == 200
connection.close()
result['agent_unix_http_health'] = True
result['permissions'] = {p: oct(Path(p).stat().st_mode & 0o777) for p in ('/etc/gpupanel', '/etc/gpupanel/agent.sock', '/opt/gpupanel/pctl')}
assert result['permissions'] == {'/etc/gpupanel': '0o700', '/etc/gpupanel/agent.sock': '0o600', '/opt/gpupanel/pctl': '0o700'}
before = json.loads((STATE / 'retained-before.json').read_text())
assert Path(before['marker_path']).read_text() == before['marker_value']
result['terminal_file_retained_after_restart'] = True
core = sqlite3.connect('file:/opt/gpupanel/db/core.db?mode=ro', uri=True)
values = core.execute("select key,value from settings where key in ('UserName','Password','EncryptKey','SecurityEntrance') order by key").fetchall()
assert hashlib.sha256(json.dumps(values).encode()).hexdigest() == before['credential_digest']
assert core.execute("select value from settings where key='BindAddress'").fetchone()[0] == '127.0.0.1'
core.close()
result['credential_and_entry_records_retained_after_restart'] = True
result['loopback_binding_persisted'] = True
tasks = sqlite3.connect('file:/opt/gpupanel/db/task.db?mode=ro', uri=True)
for task_id in before['task_ids']:
    assert tasks.execute('select status from tasks where id=?', (task_id,)).fetchone()[0] == 'Success'
tasks.close()
result['four_successful_tasks_retained_after_restart'] = True
listeners = subprocess.check_output(['ss', '-ltnp'], text=True)
port_lines = [line for line in listeners.splitlines() if ':9999 ' in line]
assert len(port_lines) == 1 and '127.0.0.1:9999' in port_lines[0]
result['loopback_listener_only'] = True
for name in ('iptables', 'ip6tables'):
    def normalize(text):
        return '\n'.join(re.sub(r'\[[0-9]+:[0-9]+\]', '[counters]', line) for line in text.splitlines() if not line.startswith('#'))
    current = subprocess.check_output([name + '-save'], text=True)
    assert normalize(current) == normalize((STATE / (name + '.before')).read_text())
    result[name + '_rules_unchanged'] = True
for pid, target in {
    108896: '/tmp/opencode/itest/opt2/gpupanel/gpupanel-core',
    108901: '/tmp/opencode/itest/opt2/gpupanel/gpupanel-agent',
    109665: '/tmp/opencode/itest/opt3/gpupanel/gpupanel-agent',
    111189: '/tmp/opencode/itest/opt/gpupanel/gpupanel-core',
    111194: '/tmp/opencode/itest/opt/gpupanel/gpupanel-agent',
}.items():
    assert target.encode() in Path('/proc/' + str(pid) + '/cmdline').read_bytes().split(b'\0')
result['preexisting_foreign_fixture_processes_preserved'] = True
docker = ['docker', '--host', 'unix:///var/run/docker.sock']
current = subprocess.check_output(docker + ['ps', '-a', '--no-trunc', '--format', '{{.ID}} {{.Names}} {{.State}}'], text=True)
assert sorted(current.splitlines()) == sorted((STATE / 'all-containers-before-final.txt').read_text().splitlines())
result['all_preexisting_container_ids_and_states_retained'] = True
networks = subprocess.check_output(docker + ['network', 'ls', '--no-trunc', '--format', '{{.ID}} {{.Name}}'], text=True)
assert sorted(networks.splitlines()) == sorted((STATE / 'networks.before').read_text().splitlines())
result['docker_networks_unchanged'] = True
remaining = subprocess.check_output(docker + ['ps', '-aq', '--filter', 'label=gpupanel.acceptance.run'], text=True)
assert not remaining.strip()
result['owned_canaries_cleaned'] = True
result['geoip_sha256'] = hashlib.sha256(Path('/opt/gpupanel/geo/GeoIP.mmdb').read_bytes()).hexdigest()
(STATE / 'runtime.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
