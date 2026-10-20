#!/usr/bin/env python3
"""Respond once to a GPUPanel local principal challenge as THIS Ubuntu user.

Never sudo this tool, pass secrets in argv/env, or send HTTP admin credentials.
"""
from __future__ import annotations

import argparse
import getpass
import os
from pathlib import Path
import re
import socket
import stat
import sys

SOCKET = re.compile(r"^/run/gpupanel-proof-[a-zA-Z0-9_-]+/pair\.sock$")
TOKEN = re.compile(r"^[A-Za-z0-9_-]{43}$")


def pair(path: str, token: str) -> bool:
    if not SOCKET.fullmatch(path) or not TOKEN.fullmatch(token):
        return False
    folder = Path(path).parent
    try:
        directory = folder.stat(follow_symlinks=False)
        target = Path(path).stat(follow_symlinks=False)
        if (not stat.S_ISDIR(directory.st_mode) or directory.st_uid != 0 or
                directory.st_mode & 0o022 or not stat.S_ISSOCK(target.st_mode) or
                target.st_uid != 0):
            return False
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as conn:
            conn.settimeout(3)
            conn.connect(path)
            conn.sendall((token + "\n").encode("ascii"))
            return conn.recv(16) == b"OK\n"
    except (OSError, UnicodeError):
        return False


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="One-time GPUPanel Linux UID verification")
    parser.add_argument("--socket", required=True, help="socketPath from authenticated local UI")
    args = parser.parse_args(argv)
    if not sys.platform.startswith("linux") or os.geteuid() == 0 or os.getuid() != os.geteuid():
        print("Run as your normal Linux user, not with sudo.", file=sys.stderr)
        return 2
    if not (sys.stdin.isatty() and sys.stderr.isatty()):
        print("Interactive terminal required to protect the pairing challenge.", file=sys.stderr)
        return 2
    token = getpass.getpass("Paste the one-time challenge from your local browser: ")
    if not pair(args.socket, token):
        print("Pairing rejected or expired. Start a new challenge.", file=sys.stderr)
        return 2
    print("Local peer observed. Return to the browser to verify status.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
