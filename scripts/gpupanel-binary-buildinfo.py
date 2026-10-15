#!/usr/bin/env python3
"""Read built Go module metadata from a verified GPL source-preview archive.

This does not execute archived binaries, grant Apache rights or prove reproducibility.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[1]
A = Path(__file__).with_name("gpupanel-artifact-license-audit.py")
spec = importlib.util.spec_from_file_location("gpupanel_artifact_license_guard", A)
attestation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(attestation)

BINARIES = {"core": "bin/1panel-core", "agent": "bin/1panel-agent"}
MODULE_LINE = re.compile(r"(?m)^module\s+(\S+)\s*$")
GO_VERSION = re.compile(r":\s+(go\d+\.\d+(?:\.\d+)?\S*)\s*$")


class InventoryError(Exception):
    """Required archive, Go build-info, or Git evidence is missing or inconsistent."""


def run_buildinfo(binary: Path, logical_name: str) -> str:
    """Inspect a file with the Go tool; never execute the file itself."""
    try:
        completed = subprocess.run(
            ["go", "version", "-m", str(binary)], check=True, capture_output=True,
            text=True, timeout=60,
        )
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise InventoryError("go version -m unavailable or rejected " + logical_name) from exc
    return completed.stdout


def parse_buildinfo(output: str, logical_name: str) -> dict:
    lines = output.splitlines()
    if not lines:
        raise InventoryError("no Go build information for " + logical_name)
    match = GO_VERSION.search(lines[0])
    if not match:
        raise InventoryError("missing Go toolchain version for " + logical_name)
    path = None
    module = None
    dependencies = []
    last_dep = None
    for raw in lines[1:]:
        fields = raw.strip().split("\t")
        if len(fields) < 2:
            continue
        label, value = fields[0], fields[1]
        if label == "path":
            if path is not None:
                raise InventoryError("duplicate Go entrypoint for " + logical_name)
            path = value
            last_dep = None
        elif label == "mod":
            if module is not None:
                raise InventoryError("duplicate Go module for " + logical_name)
            module = value
            last_dep = None
        elif label == "dep":
            if len(fields) < 3 or not value or not fields[2]:
                raise InventoryError("incomplete Go dependency in " + logical_name)
            last_dep = {"module": value, "version": fields[2],
                        "review": "THIRD_PARTY_REVIEW"}
            dependencies.append(last_dep)
        elif label == "=>":
            if last_dep is None or not value:
                raise InventoryError("orphan Go replacement in " + logical_name)
            if "replacement" in last_dep:
                raise InventoryError("duplicate Go replacement in " + logical_name)
            last_dep["replacement"] = {"module_or_path": value,
                                       "version": fields[2] if len(fields) >= 3 else None}
            last_dep["review"] = "REPLACEMENT_REVIEW"
        else:
            last_dep = None
    if not path or not module:
        raise InventoryError("missing Go main module or entrypoint in " + logical_name)
    return {"go_version": match.group(1), "entrypoint": path,
            "main_module": module,
            "dependencies": sorted(dependencies, key=lambda d: (d["module"], d["version"]))}


def source_module(root: Path, sha: str, scope: str) -> str:
    try:
        content = attestation.git(root, "show", sha + ":" + scope + "/go.mod")
    except attestation.AttestationError as exc:
        raise InventoryError("missing committed " + scope + "/go.mod") from exc
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise InventoryError("non-UTF8 source go.mod") from exc
    match = MODULE_LINE.search(text)
    if not match:
        raise InventoryError("missing module declaration for " + scope)
    return match.group(1)


def inspect(root: Path, archive: Path, baseline: str = attestation.BASELINE) -> dict:
    root = root.resolve()
    archive = Path(archive)  # do not erase symlink identity
    try:
        binding = attestation.inspect(root, archive, baseline=baseline)
    except attestation.AttestationError as exc:
        raise InventoryError("archive legal-source attestation failed: " + str(exc)) from exc
    sha = binding["source_commit"]
    records = {}
    try:
        with tarfile.open(archive, "r:gz") as package:
            for scope, archive_name in BINARIES.items():
                expected = source_module(root, sha, scope)
                member = package.extractfile("gpupanel/" + archive_name)
                if member is None:
                    raise InventoryError("binary absent from verified archive: " + archive_name)
                # Isolated temporary binary is NOT run; only inspected by go version -m.
                with tempfile.TemporaryDirectory(prefix="gpupanel-go-buildinfo-") as tmp:
                    binary = Path(tmp) / Path(archive_name).name
                    with binary.open("wb") as output:
                        shutil.copyfileobj(member, output, length=1024 * 1024)
                    data = parse_buildinfo(run_buildinfo(binary, archive_name), archive_name)
                if data["main_module"] != expected:
                    raise InventoryError(scope + " main module differs from committed go.mod")
                if data["entrypoint"] != expected + "/cmd/server":
                    raise InventoryError(scope + " entrypoint differs from committed Go package")
                data["expected_module_from_commit"] = expected
                data["archive_member"] = archive_name
                data["dependency_count"] = len(data["dependencies"])
                records[scope] = data
    except (OSError, tarfile.TarError) as exc:
        raise InventoryError("cannot read verified archive binaries: " + str(exc)) from exc

    return {"schema_version": 1, "result": "GO_BINARY_MODULE_METADATA_MATCHES_SOURCE",
            "source_commit": sha, "archive_sha256": binding["archive_sha256"],
            "distribution_license": "GPL-3.0 (fork; not relicensed)",
            "scope": "Go binary embedded build-info for two existing preview executables",
            "not_proven": ["reproducible_build", "binary_source_identity",
                           "dependency_license_text", "frontend_embedded_asset_provenance",
                           "complete_sbom", "artifact_signature", "Apache-2.0_eligibility"],
            "binaries": records}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--repo", type=Path, default=ROOT)
    parser.add_argument("--baseline", default=attestation.BASELINE)
    parser.add_argument("--output", type=Path)
    options = parser.parse_args(argv)
    try:
        report = inspect(options.repo, options.archive, options.baseline)
        payload = json.dumps(report, indent=2, ensure_ascii=True, sort_keys=True) + "\n"
        if options.output is None:
            sys.stdout.write(payload)
        else:
            options.output.write_text(payload, encoding="utf-8")
            print("Go binary metadata report written to " + str(options.output),
                  file=sys.stderr)
        return 0
    except (InventoryError, OSError) as exc:
        print("go binary inventory BLOCKED: " + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
