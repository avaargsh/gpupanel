#!/usr/bin/env python3
"""Guest-only lifecycle/collision probes for the task-owned installed VM."""
import hashlib
import json
import candidate_identity
from pathlib import Path
import shlex
import subprocess
import time
import vm

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / '.local/install-test'
if not vm.owned_pid('qemu.pid', str(vm.STATE / 'disk.qcow2')):
    raise SystemExit('Task-owned VM is not running')


def remote(args, check=True):
    value = subprocess.run(vm.ssh_args() + [shlex.join(args)], capture_output=True, text=True, timeout=40)
    if check and value.returncode:
        raise RuntimeError('Guest probe failed; inspect private runtime log: ' + value.stderr[-500:])
    return value


def python(source):
    return json.loads(remote(['sudo', 'python3', '-c', source]).stdout)


def health():
    return python('''import socket,http.client,json
s=socket.socket(socket.AF_UNIX);s.settimeout(2);s.connect('/etc/gpupanel/agent.sock')
c=http.client.HTTPConnection('unix',timeout=2);c.sock=s
c.request('GET','/api/v1/health/check');r=c.getresponse();body=json.loads(r.read())
print(json.dumps({'status':r.status,'code':body.get('code')}));c.close()
''')


def wait_agent():
    for _ in range(30):
        try:
            result = health()
            if result == {'status': 200, 'code': 200}:
                return
        except (RuntimeError, ValueError):
            pass
        time.sleep(0.5)
    raise RuntimeError('Agent never served a real Unix HTTP health response')


def retained():
    return python('''from pathlib import Path
import hashlib,json,sqlite3
p=Path('/home/ubuntu/.gpupanel-install-test-retained')
if not p.exists(): p.write_text('gpupanel-disposable-fixture-retained-data')
c=sqlite3.connect('file:/opt/gpupanel/db/core.db?mode=ro',uri=True)
rows=c.execute("SELECT key,value FROM settings WHERE key IN ('UserName','SecurityEntrance') ORDER BY key").fetchall();c.close()
print(json.dumps({'marker_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'settings_sha256':hashlib.sha256(json.dumps(rows).encode()).hexdigest()}))
''')


candidate_before = candidate_identity.assert_installed_candidate(vm)
checkout_commit = candidate_identity.source_checkout_commit(ROOT)
guest_identity_before = candidate_identity.guest_identity_fingerprint(vm)
result = {'kind': 'LIVE guest-only lifecycle; not complete App recovery acceptance'}
expected = {scope: hashlib.file_digest((ROOT / 'build' / f'gpupanel-{scope}').open('rb'), 'sha256').hexdigest() for scope in ('core', 'agent')}
installed = python('''import hashlib,json
print(json.dumps({name:hashlib.file_digest(open('/opt/gpupanel/gpupanel-'+name,'rb'),'sha256').hexdigest() for name in ('core','agent')}))
''')
assert expected == installed == candidate_before, 'Installed binaries differ from the tested build'
result['binary_sha256'] = installed
before = retained()
wait_agent()
remote(['sudo', 'systemctl', 'restart', 'gpupanel-agent'])
wait_agent()
remote(['sudo', 'systemctl', 'restart', 'gpupanel-agent'])
wait_agent()
result['two_clean_agent_restarts'] = True
permissions = python('''import os,json,stat
paths=['/etc/gpupanel','/etc/gpupanel/agent.sock','/opt/gpupanel/pctl']
print(json.dumps({p:oct(stat.S_IMODE(os.stat(p).st_mode)) for p in paths}))
''')
assert permissions == {'/etc/gpupanel': '0o700', '/etc/gpupanel/agent.sock': '0o600', '/opt/gpupanel/pctl': '0o700'}
result['permissions'] = permissions
# A repeat installer must refuse before changing service processes or binaries.
pid_before = remote(['sudo', 'systemctl', 'show', 'gpupanel-core', 'gpupanel-agent', '--property=MainPID', '--value']).stdout
payload = next((ROOT / 'build/release').glob('gpupanel-*/install.sh'))
repeated = remote(['sudo', '/tmp/' + payload.parent.name + '/install.sh'], check=False)
# The default installer must deny before executing package-supplied
# preflight code. A repeat install is not a resume or upgrade, and must never
# be authorized by this lifecycle test.
assert repeated.returncode != 0 and 'install authorization denied' in repeated.stdout
pid_after = remote(['sudo', 'systemctl', 'show', 'gpupanel-core', 'gpupanel-agent', '--property=MainPID', '--value']).stdout
assert pid_before == pid_after
result['repeat_install_refused_without_service_restart'] = True
# Kill only this guest's service. Product startup must refuse its stale socket.
remote(['sudo', 'systemctl', 'kill', '--kill-whom=main', '--signal=SIGKILL', 'gpupanel-agent'])
time.sleep(6)
remote(['sudo', 'systemctl', 'stop', 'gpupanel-agent'])
stale = python('''import os,socket,stat,json
p='/etc/gpupanel/agent.sock';info=os.lstat(p)
assert stat.S_ISSOCK(info.st_mode) and info.st_uid==0
s=socket.socket(socket.AF_UNIX);s.settimeout(1)
try:
 s.connect(p)
 raise RuntimeError('Active owner still present; refuse fixture cleanup')
except ConnectionRefusedError: pass
finally: s.close()
print(json.dumps({'stale_socket_retained':True,'inode':info.st_ino}))
''')
result['unclean_crash_retains_socket_fail_closed'] = stale['stale_socket_retained']
# Explicit fixture operator recovery; NOT an automatic product retry/cleanup.
cleanup = '''import os,socket,stat
p='/etc/gpupanel/agent.sock';before=os.lstat(p)
assert stat.S_ISSOCK(before.st_mode) and before.st_uid==0
s=socket.socket(socket.AF_UNIX);s.settimeout(1)
try:
 s.connect(p)
 raise RuntimeError('Active socket; cleanup refused')
except ConnectionRefusedError: pass
finally: s.close()
after=os.lstat(p)
assert (before.st_dev,before.st_ino)==(after.st_dev,after.st_ino)
os.unlink(p)
'''
remote(['sudo', 'python3', '-c', cleanup])
remote(['sudo', 'systemctl', 'start', 'gpupanel-agent'])
wait_agent()
result['explicit_fixture_operator_recovery'] = True
assert before == retained(), 'Fixture marker or retained login settings changed'
result['fixture_marker_and_login_settings_retained'] = True
if candidate_identity.assert_installed_candidate(vm) != candidate_before:
    raise RuntimeError('installed binaries changed during lifecycle smoke')
if candidate_identity.source_checkout_commit(ROOT) != checkout_commit:
    raise RuntimeError('source checkout changed during lifecycle smoke')
if candidate_identity.guest_identity_fingerprint(vm) != guest_identity_before:
    raise RuntimeError('guest identity changed during lifecycle smoke')
result['candidate_commit'] = checkout_commit
result['guest_identity_sha256'] = guest_identity_before
(STATE / 'runtime-live.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
