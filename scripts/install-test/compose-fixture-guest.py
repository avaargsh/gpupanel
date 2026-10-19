#!/usr/bin/env python3
"""Offline Docker Compose fixture on a task-owned disposable Ubuntu CI guest.

Never an AppInstall acceptance test: no GPUPanel API, no published image, no
external container network and no host port bindings. Invoke only after the
runner has verified exact Core/Agent binary+guest identity.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import uuid

LABEL = "REAL GUEST OFFLINE DOCKER COMPOSE FIXTURE; NOT GPUPanel AppInstall"


def call(args, *, cwd=None):
    # Never stream potentially credential-bearing Docker output to CI.
    result = subprocess.run(args, cwd=cwd, capture_output=True, text=True,
                            timeout=75, check=False)
    if result.returncode:
        raise RuntimeError("isolated Docker fixture command failed")
    return result.stdout


def run(source_sha: str, machine_digest: str) -> dict:
    if not (len(source_sha) == 40 and all(c in "0123456789abcdef" for c in source_sha)):
        raise RuntimeError("candidate source invalid")
    if not (len(machine_digest) == 64 and all(c in "0123456789abcdef" for c in machine_digest)):
        raise RuntimeError("guest identity invalid")
    if hashlib.sha256(Path("/etc/machine-id").read_bytes()).hexdigest() != machine_digest:
        raise RuntimeError("fixture guest changed")
    if os.geteuid() != 0 or os.uname().nodename != "gpupanel-install-test":
        raise RuntimeError("refuse non-root or foreign guest")
    if not Path("/opt/gpupanel/gpupanel-core").is_file():
        raise RuntimeError("GPUPanel installed guest missing")

    binary = shutil.which("busybox")
    if not binary:
        raise RuntimeError("busybox-static prerequisite missing")
    project = "gpupanel-ci-" + uuid.uuid4().hex[:12]
    image = project + ":offline"
    created = False
    result = {
        "kind": LABEL,
        "source_sha": source_sha,
        "guest_machine_id_sha256": machine_digest,
        "container_created": False,
        "logs_observed": False,
        "offline_no_host_ports": False,
        "marker_reread_after_stop_start": False,
        "marker_reread_after_restart": False,
        "container_removed": False,
        "local_image_removed": False,
    }
    with tempfile.TemporaryDirectory(prefix="gpupanel-ci-compose-") as td:
        folder = Path(td)
        folder.chmod(0o700)
        (folder / "data").mkdir(mode=0o700)
        marker = "owned-composable-fixture:" + uuid.uuid4().hex
        (folder / "data/marker").write_text(marker, encoding="utf-8")
        shutil.copyfile(binary, folder / "busybox")
        (folder / "Dockerfile").write_text(
            'FROM scratch\nCOPY busybox /bin/busybox\n', encoding="utf-8"
        )
        (folder / "compose.yaml").write_text(
            "services:\n  fixture:\n"
            f"    image: {image}\n"
            "    pull_policy: never\n"
            "    network_mode: none\n"
            "    read_only: true\n"
            "    cap_drop: [ALL]\n"
            "    security_opt: [no-new-privileges:true]\n"
            "    volumes:\n"
            f"      - {folder / 'data'}:/data:ro\n"
            "    command: ['/bin/busybox', 'sh', '-c',"
            " 'echo fixture-start; exec /bin/busybox sleep 600']\n",
            encoding="utf-8",
        )
        compose = ["docker", "compose", "-p", project,
                   "-f", str(folder / "compose.yaml")]
        def c(*args):
            return call([*compose, *args], cwd=folder)
        try:
            assert not call(["docker", "ps", "-aq",
                 "--filter", f"label=com.docker.compose.project={project}"]).strip()
            call(["docker", "build", "--pull=false", "--network=none",
                  "-t", image, str(folder)])
            created = True
            c("up", "-d", "--no-build", "--pull", "never")
            ids = c("ps", "-q", "fixture").split()
            if len(ids) != 1 or not ids[0]:
                raise RuntimeError("fixture container not created")
            container_id = ids[0]
            def state():
                obj = json.loads(call(["docker", "inspect", container_id]))[0]
                if obj.get("State", {}).get("Running") is not True:
                    raise RuntimeError("fixture container not running")
                if obj.get("HostConfig", {}).get("NetworkMode") != "none":
                    raise RuntimeError("fixture unexpectedly networked")
                if obj.get("HostConfig", {}).get("PortBindings") not in ({}, None):
                    raise RuntimeError("fixture unexpectedly published ports")
                return obj
            state()
            result["container_created"] = True
            result["offline_no_host_ports"] = True
            assert "fixture-start" in c("logs", "--no-color", "fixture")
            result["logs_observed"] = True
            def reread():
                observed = c("exec", "-T", "fixture", "/bin/busybox", "cat",
                             "/data/marker").strip()
                if observed != marker:
                    raise RuntimeError("fixture persisted file changed")
            reread()
            c("stop", "fixture")
            c("start", "fixture")
            state()
            reread()
            result["marker_reread_after_stop_start"] = True
            c("restart", "fixture")
            state()
            reread()
            result["marker_reread_after_restart"] = True
            c("down", "--remove-orphans")
            if call(["docker", "ps", "-aq",
                     "--filter", f"label=com.docker.compose.project={project}"]).strip():
                raise RuntimeError("fixture containers remain after cleanup")
            result["container_removed"] = True
            call(["docker", "image", "rm", image])
            created = False
            if call(["docker", "image", "ls", "-q", image]).strip():
                raise RuntimeError("fixture image remains")
            result["local_image_removed"] = True
        finally:
            # Cleanup ONLY the randomly scoped fixture. Never prune general
            # Docker resources, volumes or other Compose projects.
            if created:
                try:
                    c("down", "--remove-orphans")
                    call(["docker", "image", "rm", image])
                except (RuntimeError, subprocess.SubprocessError):
                    pass
    if not all(value is True for key, value in result.items()
               if key not in ("kind", "source_sha", "guest_machine_id_sha256")):
        raise RuntimeError("incomplete offline Compose lifecycle")
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--machine-id-sha256", required=True)
    args = parser.parse_args()
    print(json.dumps(run(args.source_sha, args.machine_id_sha256), sort_keys=True))


if __name__ == "__main__":
    main()
