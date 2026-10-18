#!/usr/bin/env python3
"""Own a local, disposable Ubuntu 24.04 VM; never install panel services on the host."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shlex
import signal
import socket
import stat
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / '.local/install-test/ubuntu2404'
CACHE = ROOT / '.local/install-test/cache'
IMAGE = 'ubuntu-24.04-minimal-cloudimg-amd64.img'
IMAGE_SHA = '2f119f50bf29fe40e73b69ae2a736e8210d8146796f036e0324315b6b3a777df'
BASE_URL = 'https://cloud-images.ubuntu.com/minimal/releases/noble/release-20261008/'
SSH_PORT, PANEL_PORT, SEED_PORT = 22281, 19998, 18089


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def owned_pid(filename, marker):
    path = STATE / filename
    if not path.is_file():
        return None
    pid = int(path.read_text().strip())
    try:
        arguments = Path(f'/proc/{pid}/cmdline').read_bytes().decode().split('\0')
        command = ' '.join(arguments)
    except FileNotFoundError:
        return None
    expected_qemu = bool(arguments and Path(arguments[0]).name == 'qemu-system-x86_64' and 'gpupanel-disposable-install-test' in arguments)
    if marker not in command or not expected_qemu:
        raise RuntimeError('PID identity changed; refuse to signal an unrelated process')
    return pid


def guarded_vm_change(action):
    """Serialize own start/stop/checkpoint commands; never follow a lock symlink."""
    if STATE.is_symlink() or not STATE.is_dir():
        raise RuntimeError("task-owned VM state directory is absent or redirected")
    lock = STATE / ".vm-owner.lock"
    fd = os.open(lock, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        mode = os.fstat(fd)
        if not stat.S_ISREG(mode.st_mode) or mode.st_uid != os.getuid():
            raise RuntimeError("VM owner lock is not an owned ordinary file")
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise RuntimeError("another owned VM operation is running") from exc
        return action()
    finally:
        os.close(fd)


def available(port):
    with socket.socket() as probe:
        if probe.connect_ex(('127.0.0.1', port)) == 0:
            raise RuntimeError(f'Port {port} is occupied; no existing listener will be stopped')


def prepare():
    os.umask(0o077)
    STATE.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    for name in ('SHA256SUMS', 'SHA256SUMS.gpg'):
        if not (CACHE / name).is_file():
            run(['curl', '--fail', '--location', '--retry', '2', '--max-time', '60', '-o', str(CACHE / name), BASE_URL + name])
    run(['gpgv', '--keyring', '/usr/share/keyrings/ubuntu-cloudimage-keyring.gpg', str(CACHE / 'SHA256SUMS.gpg'), str(CACHE / 'SHA256SUMS')])
    lines = (CACHE / 'SHA256SUMS').read_text().splitlines()
    if not any(line.split() == [IMAGE_SHA, '*' + IMAGE] for line in lines):
        raise RuntimeError('Signed Ubuntu checksum does not match the pinned image identity')
    image = CACHE / IMAGE
    partial = CACHE / (IMAGE + '.partial')
    if not image.is_file():
        if not partial.is_file():
            run(['curl', '--fail', '--location', '--retry', '2', '--max-time', '600', '-o', str(partial), BASE_URL + IMAGE])
        if hashlib.file_digest(partial.open('rb'), 'sha256').hexdigest() != IMAGE_SHA:
            raise RuntimeError('Ubuntu image checksum mismatch; no VM created')
        partial.rename(image)
    if hashlib.file_digest(image.open('rb'), 'sha256').hexdigest() != IMAGE_SHA:
        raise RuntimeError('Cached Ubuntu image drift')
    if not (STATE / 'id_ed25519').exists():
        run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', str(STATE / 'id_ed25519')])
    overlay = STATE / 'disk.qcow2'
    if not overlay.exists():
        run(['qemu-img', 'create', '-f', 'qcow2', '-F', 'qcow2', '-b', str(image), str(overlay), '12G'])
    seed = STATE / 'seed'
    seed.mkdir(exist_ok=True)
    public = (STATE / 'id_ed25519.pub').read_text().strip()
    (seed / 'meta-data').write_text('instance-id: gpupanel-local-install-20261016\nlocal-hostname: gpupanel-install-test\n')
    (seed / 'user-data').write_text('#cloud-config\nusers:\n  - name: ubuntu\n    groups: [sudo]\n    shell: /bin/bash\n    sudo: ALL=(ALL) NOPASSWD:ALL\n    lock_passwd: true\n    ssh_authorized_keys:\n      - ' + public + '\nssh_pwauth: false\ndisable_root: true\npackage_update: false\n')
    (seed / 'vendor-data').write_text('#cloud-config\n{}\n')
    (STATE / 'image-provenance.json').write_text(json.dumps({'url': BASE_URL + IMAGE, 'sha256': IMAGE_SHA, 'signed_checksum_verified': True, 'purpose': 'disposable-install-test'}, indent=2) + '\n')
    print('Prepared private VM disk and key; verified signed Ubuntu image checksum')


def ssh_args():
    return ['ssh', '-p', str(SSH_PORT), '-i', str(STATE / 'id_ed25519'), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=3', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'UserKnownHostsFile=' + str(STATE / 'known_hosts'), 'ubuntu@127.0.0.1']


def start():
    if owned_pid('qemu.pid', str(STATE / 'disk.qcow2')):
        print('Task-owned VM already running')
        return
    if not (STATE / 'image-provenance.json').is_file():
        raise RuntimeError('Run prepare first')
    for port in (SSH_PORT, PANEL_PORT, SEED_PORT):
        available(port)
    with (STATE / 'seed-http.log').open('ab') as log:
        server = subprocess.Popen([sys.executable, '-m', 'http.server', str(SEED_PORT), '--bind', '127.0.0.1', '--directory', str(STATE / 'seed')], stdout=log, stderr=log, start_new_session=True)
    (STATE / 'seed.pid').write_text(str(server.pid))
    try:
        run(['qemu-system-x86_64', '-name', 'gpupanel-disposable-install-test', '-enable-kvm', '-cpu', 'host', '-m', '2048', '-smp', '2', '-drive', f'file={STATE}/disk.qcow2,format=qcow2,if=virtio', '-netdev', f'user,id=net0,hostfwd=tcp:127.0.0.1:{SSH_PORT}-:22,hostfwd=tcp:127.0.0.1:{PANEL_PORT}-:9999', '-device', 'virtio-net-pci,netdev=net0', '-smbios', f'type=1,serial=ds=nocloud;s=http://10.0.2.2:{SEED_PORT}/', '-display', 'none', '-serial', f'file:{STATE}/console.log', '-daemonize', '-pidfile', str(STATE / 'qemu.pid')])
        for _ in range(100):
            check = subprocess.run(ssh_args() + ['true'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if check.returncode == 0:
                print(f'VM SSH ready on 127.0.0.1:{SSH_PORT}; panel forward 127.0.0.1:{PANEL_PORT}')
                return
            time.sleep(1)
        raise RuntimeError('Guest SSH readiness timeout; inspect private console.log')
    finally:
        if server.poll() is None:
            server.terminate()
            server.wait(timeout=5)


def stop():
    pid = owned_pid('qemu.pid', str(STATE / 'disk.qcow2'))
    if not pid:
        print('Task-owned VM is not running')
        return
    subprocess.run(ssh_args() + ['sudo poweroff'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(15):
        if not Path(f'/proc/{pid}').exists():
            print('Task-owned VM stopped; private disk retained')
            return
        time.sleep(1)
    if owned_pid('qemu.pid', str(STATE / 'disk.qcow2')) == pid:
        os.kill(pid, signal.SIGTERM)
    print('Task-owned QEMU stopped; private disk retained')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare', 'start', 'stop', 'checkpoint', 'verify-checkpoint', 'status', 'ssh', 'copy'])
    parser.add_argument('args', nargs=argparse.REMAINDER)
    options = parser.parse_args()
    if options.action == 'prepare': prepare()
    elif options.action == 'start': guarded_vm_change(start)
    elif options.action == 'stop': guarded_vm_change(stop)
    elif options.action == 'checkpoint':
        if options.args: parser.error('checkpoint takes no arguments')
        from checkpoint import create_checkpoint
        folder = guarded_vm_change(lambda: create_checkpoint(
            STATE, CACHE, IMAGE, IMAGE_SHA, BASE_URL + IMAGE,
            is_running=lambda: bool(owned_pid('qemu.pid', str(STATE / 'disk.qcow2'))),
        ))
        print('Sealed offline checkpoint:', folder)
        print('This does NOT verify restoration or authorize installation.')
    elif options.action == 'verify-checkpoint':
        if len(options.args) != 1: parser.error('verify-checkpoint needs one checkpoint name')
        from checkpoint import CHECKPOINT_NAME, verify_checkpoint
        name = options.args[0]
        if not CHECKPOINT_NAME.fullmatch(name):
            raise RuntimeError('invalid task-owned checkpoint name')
        info = verify_checkpoint(STATE / 'checkpoints' / name)
        print(json.dumps(info, indent=2))
    elif options.action == 'status': print(json.dumps({'running': bool(owned_pid('qemu.pid', str(STATE / 'disk.qcow2'))), 'ssh_port': SSH_PORT, 'panel_port': PANEL_PORT}))
    elif options.action == 'ssh':
        args = options.args[1:] if options.args[:1] == ['--'] else options.args
        if not args: parser.error('ssh needs a guest command')
        if not owned_pid('qemu.pid', str(STATE / 'disk.qcow2')): raise RuntimeError('Task-owned VM is not running')
        run(ssh_args() + [shlex.join(args)])
    elif options.action == 'copy':
        if len(options.args) != 1: parser.error('copy needs one local file')
        source = Path(options.args[0]).resolve(strict=True)
        if not source.is_file(): parser.error('copy source must be a file')
        if not owned_pid('qemu.pid', str(STATE / 'disk.qcow2')): raise RuntimeError('Task-owned VM is not running')
        run(['scp', '-P', str(SSH_PORT), '-i', str(STATE / 'id_ed25519'), '-o', 'StrictHostKeyChecking=accept-new', '-o', 'UserKnownHostsFile=' + str(STATE / 'known_hosts'), str(source), 'ubuntu@127.0.0.1:/tmp/' + source.name])

if __name__ == '__main__':
    try: main()
    except (OSError, RuntimeError, subprocess.SubprocessError) as exc:
        print('REFUSED:', exc, file=sys.stderr)
        raise SystemExit(1)
