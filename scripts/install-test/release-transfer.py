"""Independent source-package -> disposable guest transfer integrity check.

SHA-256 equality guards against transport or staging corruption. This is NOT
an upstream signing ceremony and does not authorize install on any real host.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import stat
import subprocess

import candidate
import vm

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / ".local/install-test"
SHA256 = re.compile(r"^[0-9a-f]{64}$")
SHA40 = re.compile(r"^[0-9a-f]{40}$")
RELEASE_SCHEMA = "gpupanel.vm.release-transfer.v1"

# No untrusted URL, path or command can select the remote archive.
REMOTE_PROBE = """import hashlib,json,os,stat,sys
from pathlib import Path
p=Path(sys.argv[1])
mode=p.lstat().st_mode
if not stat.S_ISREG(mode):
 raise RuntimeError('guest release archive must be a regular non-symlink file')
with p.open('rb') as stream:
 digest=hashlib.file_digest(stream,'sha256').hexdigest()
print(json.dumps({
 'archive_sha256':digest,
 'guest_machine_id_sha256':
   hashlib.sha256(Path('/etc/machine-id').read_bytes()).hexdigest()
}))
"""


def transfer_proof(*, source_sha: str, archive: str,
                   local_digest: str, remote: dict) -> dict:
    """Build a minimal, redacted report or fail closed on any mismatch."""
    if not isinstance(source_sha, str) or not SHA40.fullmatch(source_sha):
        raise RuntimeError("invalid source revision")
    expected = f"gpupanel-ci-{source_sha[:12]}-linux-amd64.tar.gz"
    if archive != expected:
        raise RuntimeError("release name differs from exact source candidate")
    if (
        not isinstance(local_digest, str)
        or not SHA256.fullmatch(local_digest)
        or not isinstance(remote, dict)
        or set(remote) != {"archive_sha256", "guest_machine_id_sha256"}
        or not isinstance(remote["archive_sha256"], str)
        or not SHA256.fullmatch(remote["archive_sha256"])
        or remote["archive_sha256"] != local_digest
        or not isinstance(remote["guest_machine_id_sha256"], str)
        or not SHA256.fullmatch(remote["guest_machine_id_sha256"])
    ):
        raise RuntimeError("guest-staged release archive is not the built release")
    return {
        "schema": RELEASE_SCHEMA,
        "source_sha": source_sha,
        "archive_name": expected,
        "local_release_sha256": local_digest,
        "guest_release_sha256": remote["archive_sha256"],
        "guest_machine_id_sha256": remote["guest_machine_id_sha256"],
        "signature_proof": "NOT_ATTESTED",
    }


def verify_guest_release() -> dict:
    # Same clean candidate as the later installed Core/Agent and browser.
    local = candidate.local_candidate(ROOT)
    source_sha = os.environ.get("GITHUB_SHA", "")
    if local["source_sha"] != source_sha:
        raise RuntimeError("checkout changed since candidate build")
    archive = f"gpupanel-ci-{source_sha[:12]}-linux-amd64.tar.gz"
    path = ROOT / "build" / archive
    if not stat.S_ISREG(path.lstat().st_mode):
        raise RuntimeError("release is missing or symlinked")
    with path.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    remote_path = f"/tmp/{archive}"
    cmd = vm.ssh_args() + [shlex.join(
        ["python3", "-c", REMOTE_PROBE, remote_path]
    )]
    try:
        result = subprocess.check_output(
            cmd, text=True, timeout=45, stderr=subprocess.DEVNULL,
        )
        observed = json.loads(result)
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired,
            ValueError) as exc:
        raise RuntimeError("guest release transfer identity unavailable") from None
    return transfer_proof(
        source_sha=source_sha, archive=archive,
        local_digest=digest, remote=observed,
    )


def main() -> None:
    proof = verify_guest_release()
    report = STATE / "release-transfer.json"
    # Never accept stale preexisting proof or an attacker-created symlink.
    with report.open("x", encoding="utf-8") as stream:
        json.dump(proof, stream, sort_keys=True)
        stream.write("\n")
    report.chmod(0o600)
    print("Guest release archive SHA-256 matches the exact built candidate; "
          "package SIGNATURE NOT ATTESTED")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Prevent SSH private endpoint, credentials or raw output leaking.
        raise SystemExit("BLOCKED: release transfer integrity unverified")
