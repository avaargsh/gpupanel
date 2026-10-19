#!/usr/bin/env python3
"""Operator/CI boundary for a genuine task-owned guest-only Docker Compose fixture."""
import json
from pathlib import Path
import shlex
import subprocess

import candidate
import vm

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / ".local/install-test"
if not vm.owned_pid("qemu.pid", str(vm.STATE / "disk.qcow2")):
    raise SystemExit("REFUSED: task-owned disposable VM not running")
local = candidate.local_candidate(ROOT)
browser = json.loads((STATE / "browser-live.json").read_text(encoding="utf-8"))
candidate.verify_browser_chain(browser, local)
runtime = json.loads((STATE / "runtime-live.json").read_text(encoding="utf-8"))
if (
    runtime.get("candidate") != local
    or runtime.get("guest_machine_id_sha256")
        != browser.get("guest_machine_id_sha256")
    or runtime.get("same_candidate_live_browser_verified") is not True
    or runtime.get("explicit_fixture_operator_recovery") is not True
):
    raise RuntimeError("same-candidate guest Agent recovery proof missing")
machine = browser["guest_machine_id_sha256"]
if not candidate.SHA256.fullmatch(machine):
    raise RuntimeError("guest identity invalid")
# This copied script is only ever called in the task-owned VM after the above
# checks and cannot use host Docker, public host ports or a remote registry.
command = [
    "sudo", "python3", "/tmp/compose-fixture-guest.py",
    "--source-sha", local["source_sha"], "--machine-id-sha256", machine,
]
resp = subprocess.run(vm.ssh_args() + [shlex.join(command)], capture_output=True,
                      text=True, timeout=300)
if resp.returncode:
    # Do not expose raw Docker stderr or guest data in public CI logs.
    # Permit only an allowlisted guest source line and error *class*.
    import re
    import sys
    positions = re.findall(
        r'File "[^"]*/compose-fixture-guest[.]py", line ([1-9][0-9]{0,4})',
        resp.stderr,
    )
    classes = re.findall(
        r'^(RuntimeError|AssertionError|FileNotFoundError|'
        r'PermissionError|subprocess[.]TimeoutExpired|OSError):',
        resp.stderr, re.MULTILINE,
    )
    line = positions[-1] if positions else "UNKNOWN"
    klass = classes[-1] if classes else "UNCLASSIFIED"
    print(f"GUEST_COMPOSE_FAILURE source=compose-fixture-guest.py:{line} "
          f"exception_class={klass} release=NO_GO", file=sys.stderr)
    raise RuntimeError("guest Docker Compose fixture failed; inspect private CI log")
proof = json.loads(resp.stdout)
expected = {
    "kind": "REAL GUEST OFFLINE DOCKER COMPOSE FIXTURE; NOT GPUPanel AppInstall",
    "source_sha": local["source_sha"],
    "guest_machine_id_sha256": machine,
    "container_created": True, "logs_observed": True,
    "offline_no_host_ports": True, "marker_reread_after_stop_start": True,
    "marker_reread_after_restart": True, "container_removed": True,
    "local_image_removed": True,
}
if proof != expected:
    raise RuntimeError("offline Compose fixture failed to prove its lifecycle")
(STATE / "compose-live.json").write_text(json.dumps(proof, indent=2) + "\n")
print("PASS: actual isolated guest Docker Compose offline fixture lifecycle")
