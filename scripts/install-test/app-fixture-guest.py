#!/usr/bin/env python3
"""Create/remove a fixed *local app definition* inside an authorized throwaway VM.

The AppInstall itself is performed only via authenticated Core API, never here.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import stat

ROOT = Path("/opt/gpupanel/resource/apps/local")
KEY = "m0ciapp"
VERSION = "1.0.0"
APP = ROOT / KEY
SHA256 = set("0123456789abcdef")
# A valid 1x1 PNG for the local application catalog parser.
PNG = ("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ"
       "AAAADUlEQVQIHWP4z8DwHwAFgAI/ScL4VwAAAABJRU5ErkJggg==")


def check_guest(expected: str):
    real = hashlib.sha256(Path("/etc/machine-id").read_bytes()).hexdigest()
    if len(expected) != 64 or any(c not in SHA256 for c in expected) or real != expected:
        raise RuntimeError("refuse foreign VM")
    if os.geteuid() != 0 or not Path("/opt/gpupanel/gpupanel-agent").is_file():
        raise RuntimeError("requires an installed disposable GPUPanel guest")
    # Do not follow a symlinked ancestor into arbitrary host/guest files.
    for parent in (Path("/opt"), Path("/opt/gpupanel"), Path("/opt/gpupanel/resource"),
                   Path("/opt/gpupanel/resource/apps"), ROOT):
        mode = parent.lstat().st_mode
        if not stat.S_ISDIR(mode):
            raise RuntimeError("refuse non-directory fixture ancestor")


def prepare():
    if APP.exists() or APP.is_symlink():
        raise RuntimeError("local test catalog key already occupied")
    version = APP / VERSION
    version.mkdir(parents=True, exist_ok=False)
    (APP / "data.yml").write_text(
        "additionalProperties:\n"
        "  name: M0 CI Fixture\n"
        "  key: m0ciapp\n"
        "  type: tool\n"
        "  tags: []\n"
        "  architectures: [amd64]\n"
        "  limit: 1\n"
        "  shortDescEn: Offline disposable app installation proof\n"
    )
    (APP / "logo.png").write_bytes(base64.b64decode(PNG))
    (APP / "README.md").write_text("Offline-only CI fixture. Not a distributable app.\n")
    (version / "data.yml").write_text("additionalProperties:\n  formFields: []\n")
    (version / "docker-compose.yml").write_text(
        "services:\n"
        "  fixture:\n"
        "    container_name: ${CONTAINER_NAME}\n"
        "    image: gpupanel-m0-fixture:local\n"
        "    pull_policy: never\n"
        "    network_mode: none\n"
        "    read_only: true\n"
        "    cap_drop: [ALL]\n"
        "    security_opt: [no-new-privileges:true]\n"
        "    command: [/bin/busybox, sleep, '600']\n"
    )
    scripts = version / "scripts"
    scripts.mkdir(mode=0o755)
    (scripts / "init.sh").write_text(
        "#!/bin/sh\n"
        "case \"${PWD##*/}\" in\n"
        "  *-fault)\n"
        "    while [ ! -e /run/gpupanel-g5-init-release ]; do sleep 0.1; done\n"
        "    ;;\n"
        "esac\n"
    )


def remove():
    # Never recursively delete an unknown tree. Only the fixed source files
    # created by prepare(), after a verified API uninstall completed.
    known = {
        APP / "data.yml", APP / "logo.png", APP / "README.md",
        APP / VERSION / "data.yml", APP / VERSION / "docker-compose.yml",
        APP / VERSION / "scripts" / "init.sh",
    }
    if not APP.is_dir() or APP.is_symlink():
        raise RuntimeError("fixture definition not owned")
    actual = {p for p in APP.rglob("*") if p.is_file() or p.is_symlink()}
    if actual != known or any(p.is_symlink() for p in actual):
        raise RuntimeError("unexpected local application files; refuse cleanup")
    for item in known:
        item.unlink()
    (APP / VERSION / "scripts").rmdir()
    (APP / VERSION).rmdir()
    APP.rmdir()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["prepare", "remove"])
    parser.add_argument("--guest-sha", required=True)
    args = parser.parse_args()
    check_guest(args.guest_sha)
    (prepare if args.action == "prepare" else remove)()
    print(json.dumps({"fixture": "localm0ciapp", "action": args.action,
                      "local_app_catalog_only": True}))


if __name__ == "__main__":
    main()
