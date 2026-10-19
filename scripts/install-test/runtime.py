#!/usr/bin/env python3
"""Guest-only lifecycle/collision probes for the task-owned installed VM."""
import candidate
import json
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


# Enforce one clean source candidate and the preceding real logged-in browser
# receipt before ANY service restart, crash, or operator test recovery action.
local = candidate.local_candidate(ROOT)
browser = json.loads((STATE / 'browser-live.json').read_text(encoding='utf-8'))
candidate.verify_browser_chain(browser, local)
installed = python('''import hashlib,json,os,subprocess
from pathlib import Path
def fingerprint(name):
 target=Path('/opt/gpupanel')/('gpupanel-'+name)
 pid=subprocess.check_output(
  ['systemctl','show','gpupanel-'+name,'-p','MainPID','--value'],
  text=True,timeout=5).strip()
 if not pid.isdecimal() or int(pid)==0:
  raise RuntimeError('installed service not running')
 live=os.stat('/proc/'+pid+'/exe'); disk=os.stat(target)
 if (live.st_dev,live.st_ino)!=(disk.st_dev,disk.st_ino):
  raise RuntimeError('running service executable differs from installed file')
 return hashlib.file_digest(target.open('rb'),'sha256').hexdigest()
print(json.dumps({
 'binary_sha256': {name:fingerprint(name) for name in ('core','agent')},
 'machine_id_sha256':hashlib.sha256(Path('/etc/machine-id').read_bytes()).hexdigest()
}))
''')
candidate.verify_installed(local, installed['binary_sha256'])
if (not candidate.SHA256.fullmatch(installed['machine_id_sha256'])
        or installed['machine_id_sha256'] != browser.get('guest_machine_id_sha256')):
    raise RuntimeError('VM guest identity changed since verified browser acceptance')
result = {
    'kind': 'LIVE guest-only lifecycle; not complete App recovery acceptance',
    'candidate': local,
    'guest_machine_id_sha256': installed['machine_id_sha256'],
    'same_candidate_live_browser_verified': True,
    'binary_sha256': installed['binary_sha256'],
}
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
(STATE / 'runtime-live.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
