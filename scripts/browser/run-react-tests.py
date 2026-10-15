#!/usr/bin/env python3
"""Run simulated browser acceptance against a task-owned local Vite server."""
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
with socket.socket() as probe:
    if probe.connect_ex(('127.0.0.1', 4189)) == 0:
        raise SystemExit('Port 4189 already occupied; refuse to reuse or stop another server')
server = subprocess.Popen(['pnpm', '--filter', '@gpupanel/panel', 'exec', 'vite', '--host', '127.0.0.1', '--port', '4189', '--strictPort'], cwd=ROOT / 'frontend', start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(100):
        if server.poll() is not None:
            raise RuntimeError('Task-owned Vite exited before readiness')
        try:
            with urllib.request.urlopen('http://127.0.0.1:4189', timeout=1) as response:
                if response.status == 200:
                    break
        except OSError:
            time.sleep(0.1)
    else:
        raise RuntimeError('Vite readiness timeout')
    completed = subprocess.run([sys.executable, str(ROOT / 'scripts/browser/remote-integration.py')], cwd=ROOT, timeout=120)
    status = completed.returncode
finally:
    if server.poll() is None:
        os.killpg(server.pid, signal.SIGTERM)
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(server.pid, signal.SIGKILL)
            server.wait(timeout=5)
raise SystemExit(status)
