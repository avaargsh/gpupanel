#!/usr/bin/env python3
"""Keep generated disposable-VM login credentials private; never print them."""
import json
from pathlib import Path
import re
import vm

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / '.local/install-test'
if not vm.owned_pid('qemu.pid', str(vm.STATE / 'disk.qcow2')):
    raise SystemExit('Task-owned VM is not running')
log = STATE / 'install.raw.log'
text = re.sub(r'\x1b\[[0-9;]*m', '', log.read_text())
password = re.search(r'^\s*password\s*:\s*([0-9a-f]{16})\s*$', text, re.M)
username = re.search(r'^\s*username\s*:\s*([A-Za-z0-9_-]+)\s*$', text, re.M)
entrance = re.search(r'^\s*internal url\s*:\s*http://[^/]+/([A-Za-z0-9_-]+)\s*$', text, re.M)
if not all((password, username, entrance)):
    raise SystemExit('Cannot identify generated fixture credentials; no output written')
path = STATE / 'credentials.json'
path.write_text(json.dumps({'url': f'http://127.0.0.1:{vm.PANEL_PORT}', 'username': username[1], 'password': password[1], 'entrance': entrance[1]}, indent=2) + '\n')
path.chmod(0o600)
log.chmod(0o600)
print('Private disposable-VM credentials saved with mode 0600; values not printed')
