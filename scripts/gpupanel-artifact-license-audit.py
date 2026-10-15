#!/usr/bin/env python3
"""Verify GPL attribution in a preview archive against its Git source commit.

This is a provenance/attribution guard, NOT an SBOM, signature or Apache grant.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[1]
BASELINE = "d9dc5d7aa981c3b04ad284e93420aca9888f7e5a"
RELEASE_PATH = Path(__file__).with_name("gpupanel-release.py")
spec = importlib.util.spec_from_file_location("gpupanel_release_guard", RELEASE_PATH)
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class AttestationError(Exception):
    """The archive or Git-based source evidence is incomplete or contradictory."""


def git(root: Path, *args: str) -> bytes:
    try:
        return subprocess.run(["git", *args], cwd=root, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, check=True, timeout=30).stdout
    except (OSError, subprocess.TimeoutExpired, subprocess.CalledProcessError) as exc:
        raise AttestationError("Git source evidence unavailable for " + " ".join(args[:2])) from exc


def resolve_commit(root: Path, revision: str) -> str:
    if not re.fullmatch(r"[0-9a-f]{40,64}", revision):
        raise AttestationError("archive source_commit must be a full Git SHA")
    resolved = git(root, "rev-parse", "--verify", revision + "^{commit}").decode().strip()
    if resolved != revision:
        raise AttestationError("source_commit resolves to a different revision")
    return resolved


def inspect(root: Path, archive: Path, baseline: str = BASELINE) -> dict:
    root = root.resolve()
    archive = Path(archive)  # preserve symlink identity for release.verify
    try:
        verified = release.verify(archive)
    except (release.ReleaseError, OSError, ValueError, tarfile.TarError,
            json.JSONDecodeError, TypeError) as exc:
        raise AttestationError("preview archive integrity check failed: " + str(exc)) from exc

    with tarfile.open(archive, "r:gz") as bundle:
        manifest = json.load(bundle.extractfile("gpupanel/manifest.json"))
        recorded = manifest.get("source_commit")
        if not isinstance(recorded, str):
            raise AttestationError("missing source_commit")
        source = resolve_commit(root, recorded)
        base = resolve_commit(root, baseline)
        git(root, "merge-base", "--is-ancestor", base, source)

        # The baseline LICENSE is the immutable GPL reference. The archive's
        # self-consistent checksums alone cannot establish its legal provenance.
        baseline_license = git(root, "show", base + ":LICENSE")
        source_license = git(root, "show", source + ":LICENSE")
        source_notice = git(root, "show", source + ":NOTICE.md")
        if (source_license != baseline_license
                or b"GNU GENERAL PUBLIC LICENSE" not in baseline_license
                or b"Version 3" not in baseline_license):
            raise AttestationError("GPL-3.0 root LICENSE differs from trusted upstream baseline")
        if b"1Panel" not in source_notice or b"GPL-3.0" not in source_notice:
            raise AttestationError("source NOTICE missing 1Panel/GPL attribution")

        evidence = {}
        for name, expected in (("LICENSE", source_license), ("NOTICE.md", source_notice)):
            stream = bundle.extractfile("gpupanel/" + name)
            if stream is None or stream.read() != expected:
                raise AttestationError("archive " + name + " differs from recorded Git source")
            evidence[name] = hashlib.sha256(expected).hexdigest()

    return {
        "schema_version": 1,
        "result": "GPL_ATTRIBUTION_BOUND_TO_SOURCE",
        "scope": "two legal-text files in source-preview archive only",
        "not_proven": [
            "binary_build_provenance", "dependency_licenses", "embedded_assets",
            "complete_sbom", "publisher_signature", "Apache-2.0_eligibility",
        ],
        "source_commit": source,
        "upstream_baseline": base,
        "archive_sha256": verified["sha256"],
        "license_document_sha256": evidence,
        "installable": False,
        "distribution_license": "GPL-3.0 (fork; not relicensed)",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=ROOT)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--baseline", default=BASELINE)
    parser.add_argument("--output", type=Path)
    options = parser.parse_args(argv)
    try:
        result = inspect(options.repo, options.archive, options.baseline)
        payload = json.dumps(result, indent=2, ensure_ascii=True, sort_keys=True) + "\n"
        if options.output:
            options.output.write_text(payload, encoding="utf-8")
            print("artifact attribution report written to " + str(options.output), file=sys.stderr)
        else:
            sys.stdout.write(payload)
        return 0
    except (AttestationError, OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
        print("artifact license attestation BLOCKED: " + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
