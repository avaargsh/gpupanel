#!/usr/bin/env python3
"""Compiled Wails binary source transfer across two fresh HOMEs.

No checked-out GPUPanel sources, GUI, network, Docker or privileged actions
are used by the application. The test itself supplies only a small fixture.
"""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

def call(binary: Path, home: Path, arg: str, *, success=True) -> dict | str:
    env = dict(os.environ)
    env.update({"HOME": str(home), "PATH": "/usr/bin:/bin",
                "PYTHONNOUSERSITE": "1"})
    proc = subprocess.run([str(binary), arg], cwd=home, env=env,
                          text=True, capture_output=True, timeout=120, check=False)
    if not success:
        assert proc.returncode != 0, (arg, proc.stdout, proc.stderr[-600:])
        return proc.stderr
    assert proc.returncode == 0, (arg, proc.stderr[-600:])
    value = json.loads(proc.stdout)
    assert isinstance(value, dict) and value.get("status"), value
    return value

def acceptance(binary: Path):
    assert binary.is_file() and os.access(binary, os.X_OK)
    with tempfile.TemporaryDirectory(prefix="gpupanel-source-fresh-homes-") as temp:
        base = Path(temp)
        origin, target = base / "old", base / "new"
        origin.mkdir(mode=0o700)
        target.mkdir(mode=0o700)
        name = "my-project"
        source = origin / "GPUPanel/projects" / name
        (source / "src").mkdir(parents=True, mode=0o700)
        (source / "src/main.py").write_text("print('portable source')\n")
        (source / "README.md").write_text("# Offline transfer\n")
        (source / "uv.lock").write_text("version = 1\n")
        (source / ".env").write_text("PASSWORD=not-exported\n")
        (source / "data").mkdir()
        (source / "data/customer.json").write_text('{"sensitive":true}')

        reviewed = call(binary, origin, f"--source-plan={name}")
        assert reviewed["status"] == "READY_FOR_APPROVAL"
        assert reviewed["excludedEntries"] >= 2
        assert len(reviewed["manifestDigest"]) == 64
        assert not (origin / "GPUPanel/backups").exists()

        call(binary, origin, f"--source-export={name}:{'0'*64}", success=False)
        assert not (origin / "GPUPanel/backups").exists()
        exported = call(binary, origin,
                        f"--source-export={name}:{reviewed['manifestDigest']}")
        assert exported["status"] == "EXPORTED", exported
        path = origin / "GPUPanel/backups" / f"{name}-source-v1.zip"
        assert path.is_file() and path.stat().st_mode & 0o777 == 0o600

        dst_folder = target / "GPUPanel/backups"
        dst_folder.mkdir(parents=True, mode=0o700)
        dst_archive = dst_folder / path.name
        shutil.copyfile(path, dst_archive)
        inspected = call(binary, target, f"--source-inspect={path.name}")
        assert inspected["status"] == "READY_FOR_APPROVAL"
        assert len(inspected["bundleDigest"]) == 64

        call(binary, target,
             f"--source-restore={path.name}:{'0'*64}", success=False)
        assert not (target / "GPUPanel/projects").exists()
        restored = call(binary, target,
                        f"--source-restore={path.name}:{inspected['bundleDigest']}")
        assert restored["status"] == "VERIFIED", restored
        migrated = target / "GPUPanel/projects" / name
        assert (migrated / "src/main.py").read_text() == "print('portable source')\n"
        assert not (migrated / ".env").exists()
        assert not (migrated / "data").exists()

        # User data is never overwritten, even when the original digest is valid.
        (migrated / "src/main.py").write_text("print('user edit stays')\n")
        call(binary, target,
             f"--source-restore={path.name}:{inspected['bundleDigest']}",
             success=False)
        assert (migrated / "src/main.py").read_text() == "print('user edit stays')\n"
        print("SOURCE_FRESH_HOME_PASS: compiled binary, independent HOMEs, "
              "bounded source ZIP digest, no overwrite, no sensitive data")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("binary", type=Path)
    args = parser.parse_args()
    acceptance(args.binary.resolve())
