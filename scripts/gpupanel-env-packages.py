"""Bounded, read-only installed package inventory using the existing uv binary."""
from __future__ import annotations
import json
from pathlib import Path
import re
import subprocess

NAME = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,119}$")
VERSION = re.compile(r"^[a-zA-Z0-9!+._-]{1,120}$")
MAX_OUTPUT = 128 * 1024
MAX_PACKAGES = 1000


def installed_packages(directory: Path, uv: str, env: dict,
                       *, runner=subprocess.run) -> dict:
    python = directory / "bin" / "python"
    if not python.is_file():
        return {"status": "INVALID_ENVIRONMENT", "packages": []}
    try:
        result = runner(
            [uv, "pip", "list", "--python", str(python),
             "--format", "json", "--offline", "--no-config"],
            capture_output=True, text=True, timeout=20, check=False, env=env,
        )
    except subprocess.TimeoutExpired:
        return {"status": "TIMEOUT", "packages": []}
    except OSError:
        return {"status": "UV_UNAVAILABLE", "packages": []}
    if result.returncode != 0:
        return {"status": "QUERY_FAILED", "packages": []}
    if not isinstance(result.stdout, str) or len(result.stdout) > MAX_OUTPUT:
        return {"status": "INVALID_RESPONSE", "packages": []}
    try:
        rows = json.loads(result.stdout)
    except (ValueError, TypeError):
        return {"status": "INVALID_RESPONSE", "packages": []}
    if not isinstance(rows, list) or len(rows) > MAX_PACKAGES:
        return {"status": "INVALID_RESPONSE", "packages": []}
    packages = []
    seen = set()
    for row in rows:
        if not isinstance(row, dict):
            return {"status": "INVALID_RESPONSE", "packages": []}
        name, version = row.get("name"), row.get("version")
        if (not isinstance(name, str) or not NAME.fullmatch(name)
                or not isinstance(version, str) or not VERSION.fullmatch(version)):
            return {"status": "INVALID_RESPONSE", "packages": []}
        key = re.sub(r"[-_.]+", "-", name).lower()
        if key in seen:
            return {"status": "INVALID_RESPONSE", "packages": []}
        seen.add(key)
        packages.append({"name": name, "version": version})
    return {"status": "OK", "packages": sorted(packages, key=lambda row: row["name"].lower()),
            "count": len(packages), "source": "uv pip list (local installed environment)"}
