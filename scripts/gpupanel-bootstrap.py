#!/usr/bin/env python3
"""GPUPanel Ubuntu development environment bootstrap: non-destructive by default.

No package installation, remote shell execution, privilege escalation or implicit downloads.
A lock supplies HTTPS URLs and expected SHA-256 for explicit artifact fetching.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
import urllib.request
from urllib.parse import urlsplit
import zipfile

NAME = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$")
DIGEST = re.compile(r"^[0-9a-f]{64}$")
MAX_ARTIFACT_BYTES = 8 * 1024**3
DEFAULT_CACHE = Path.home() / ".cache" / "gpupanel" / "artifacts"


class BootstrapError(Exception):
    pass


def load_lock(path: Path) -> dict:
    try:
        lock = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise BootstrapError("cannot read lock: " + str(exc)) from exc
    if not isinstance(lock, dict) or lock.get("format_version") != 1:
        raise BootstrapError("unsupported lock format")
    if lock.get("os") != "ubuntu-24.04":
        raise BootstrapError("only ubuntu-24.04 is supported")
    if not isinstance(lock.get("tools"), list) or not isinstance(lock.get("artifacts"), list):
        raise BootstrapError("tools and artifacts must be arrays")
    seen = set()
    for tool in lock["tools"]:
        if not isinstance(tool, dict) or not isinstance(tool.get("name"), str) or not NAME.fullmatch(tool["name"]):
            raise BootstrapError("invalid tool name")
        if not isinstance(tool.get("command"), str) or not NAME.fullmatch(tool["command"]):
            raise BootstrapError("invalid tool command")
    for artifact in lock["artifacts"]:
        if not isinstance(artifact, dict):
            raise BootstrapError("invalid artifact")
        name = artifact.get("name")
        digest = artifact.get("sha256")
        urls = artifact.get("urls")
        if not isinstance(name, str) or not NAME.fullmatch(name) or name in seen:
            raise BootstrapError("invalid or duplicate artifact name")
        seen.add(name)
        if not isinstance(digest, str) or not DIGEST.fullmatch(digest):
            raise BootstrapError("invalid sha256 for " + name)
        if not isinstance(urls, list) or not urls or not all(isinstance(u, str) for u in urls):
            raise BootstrapError("artifact requires HTTPS mirror URLs")
        for url in urls:
            parts = urlsplit(url)
            if parts.scheme != "https" or not parts.hostname or parts.username or parts.password or parts.fragment:
                raise BootstrapError("only HTTPS URLs without credentials/fragments are allowed")
    return lock


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def check_artifact(cache: Path, artifact: dict) -> bool:
    destination = cache / artifact["name"]
    return destination.is_file() and not destination.is_symlink() and sha256_file(destination) == artifact["sha256"]


def doctor(lock: dict) -> dict:
    try:
        os_info = {}
        for line in Path("/etc/os-release").read_text(encoding="utf-8").splitlines():
            if "=" in line:
                key, value = line.split("=", 1)
                os_info[key] = value.strip().strip('"')
    except OSError:
        os_info = {}
    supported = os_info.get("ID") == "ubuntu" and os_info.get("VERSION_ID") == "24.04"
    return {
        "supported_os": supported,
        "detected_os": {"id": os_info.get("ID"), "version": os_info.get("VERSION_ID")},
        "tools": [{"name": t["name"], "command": t["command"], "installed": bool(shutil.which(t["command"]))}
                  for t in lock["tools"]],
        "note": "No system changes were made. Tool presence does not prove required version/configuration.",
    }


def get_artifact(artifact: dict, cache: Path, timeout: float, offline: bool) -> str:
    cache.mkdir(parents=True, exist_ok=True)
    destination = cache / artifact["name"]
    if check_artifact(cache, artifact):
        return "cached"
    if offline:
        raise BootstrapError("offline cache missing or checksum failed: " + artifact["name"])
    last_error = "no mirror available"
    for url in artifact["urls"]:
        tmp_name = None
        try:
            with tempfile.NamedTemporaryFile(prefix=".gpupanel-", dir=cache, delete=False) as out:
                tmp_name = out.name
                length = 0
                digest = hashlib.sha256()
                with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "GPUPanel-bootstrap/1"}), timeout=timeout) as response:
                    # urllib follows redirects; never allow a signed HTTPS URL to downgrade to plaintext.
                    final_url = getattr(response, "geturl", lambda: url)()
                    if urlsplit(final_url).scheme != "https":
                        raise BootstrapError("HTTPS redirect downgrade rejected")
                    while True:
                        chunk = response.read(1024 * 1024)
                        if not chunk:
                            break
                        length += len(chunk)
                        if length > MAX_ARTIFACT_BYTES:
                            raise BootstrapError("artifact exceeds download limit")
                        digest.update(chunk)
                        out.write(chunk)
            if digest.hexdigest() != artifact["sha256"]:
                raise BootstrapError("SHA-256 mismatch")
            if destination.is_symlink():
                raise BootstrapError("cache target cannot be symlink")
            os.replace(tmp_name, destination)
            return "downloaded"
        except (OSError, ValueError, BootstrapError) as exc:
            last_error = str(exc)
        finally:
            if tmp_name and os.path.exists(tmp_name):
                os.unlink(tmp_name)
    raise BootstrapError("all mirrors failed for " + artifact["name"] + ": " + last_error)


def export_bundle(lock_path: Path, lock: dict, cache: Path, destination: Path) -> None:
    for item in lock["artifacts"]:
        if not check_artifact(cache, item):
            raise BootstrapError("cannot export unverified artifact: " + item["name"])
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destination, "w", zipfile.ZIP_STORED) as archive:
        archive.write(lock_path, arcname="profile.lock.json")
        for item in lock["artifacts"]:
            archive.write(cache / item["name"], arcname="artifacts/" + item["name"])


def import_bundle(bundle: Path, cache: Path, expected_lock: dict) -> None:
    cache.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(bundle) as archive:
        expected_names = {"profile.lock.json"} | {"artifacts/" + x["name"] for x in expected_lock["artifacts"]}
        if set(archive.namelist()) != expected_names:
            raise BootstrapError("bundle contents do not match lock")
        included = json.loads(archive.read("profile.lock.json"))
        if included != expected_lock:
            raise BootstrapError("bundle lock differs from selected profile")
        for item in expected_lock["artifacts"]:
            name = "artifacts/" + item["name"]
            target = cache / item["name"]
            with archive.open(name) as src, tempfile.NamedTemporaryFile(dir=cache, prefix=".gpupanel-", delete=False) as dst:
                tmp = Path(dst.name)
                digest = hashlib.sha256()
                size = 0
                try:
                    for chunk in iter(lambda: src.read(1024 * 1024), b""):
                        size += len(chunk)
                        if size > MAX_ARTIFACT_BYTES:
                            raise BootstrapError("bundle artifact exceeds limit")
                        digest.update(chunk)
                        dst.write(chunk)
                finally:
                    dst.flush()
            try:
                if digest.hexdigest() != item["sha256"] or target.is_symlink():
                    raise BootstrapError("unverified bundle artifact: " + item["name"])
                os.replace(tmp, target)
            finally:
                tmp.unlink(missing_ok=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="GPUPanel Ubuntu environment doctor and verified offline bundle tool")
    parser.add_argument("--lock", type=Path, default=Path(__file__).resolve().parents[1] / "profiles" / "ubuntu24-dev.lock.json")
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("doctor")
    sub.add_parser("plan")
    sub.add_parser("verify")
    fetch = sub.add_parser("fetch")
    fetch.add_argument("--offline", action="store_true")
    fetch.add_argument("--timeout", type=float, default=30.0)
    pack = sub.add_parser("bundle")
    pack.add_argument("destination", type=Path)
    unpack = sub.add_parser("import-bundle")
    unpack.add_argument("source", type=Path)
    args = parser.parse_args(argv)
    try:
        lock = load_lock(args.lock)
        if args.command == "doctor":
            result = doctor(lock)
        elif args.command == "plan":
            result = {"profile": lock.get("profile"), "actions": ["inspect", "verify-artifacts"],
                      "tools": doctor(lock)["tools"],
                      "downloads": [{"name": x["name"], "verified": check_artifact(args.cache, x)} for x in lock["artifacts"]],
                      "warning": "No packages or downloaded executables are installed by this command"}
        elif args.command == "verify":
            result = {"artifacts": [{"name": x["name"], "verified": check_artifact(args.cache, x)} for x in lock["artifacts"]]}
            if not all(x["verified"] for x in result["artifacts"]):
                raise BootstrapError("cache contains missing or invalid artifacts: " + json.dumps(result))
        elif args.command == "fetch":
            if args.timeout <= 0:
                raise BootstrapError("timeout must be positive")
            result = {"artifacts": [{"name": a["name"], "result": get_artifact(a, args.cache, args.timeout, args.offline)}
                                    for a in lock["artifacts"]]}
        elif args.command == "bundle":
            export_bundle(args.lock, lock, args.cache, args.destination)
            result = {"exported": str(args.destination)}
        else:
            import_bundle(args.source, args.cache, lock)
            result = {"imported": str(args.source), "verified": True}
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (BootstrapError, OSError, ValueError, zipfile.BadZipFile) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
