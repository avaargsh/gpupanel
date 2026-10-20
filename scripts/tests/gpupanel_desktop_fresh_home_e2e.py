#!/usr/bin/env python3
"""Real Ubuntu smoke: compiled, relocatable Wails binary + official pinned uv.

Execute from fresh HOME, no repository checkout, graphical session, Docker,
GPUPanel Core or privileged operations. Intentional mutating actions require
a previewed digest; fake/unknown acknowledgements are never treated as GO.
"""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ARCHIVE = "uv-x86_64-unknown-linux-gnu.tar.gz"
UV_VERSION = "0.13.3"


def call(binary: Path, home: Path, flag: str, *, should_succeed=True) -> dict | str:
    env = dict(os.environ)
    env.update({
        "HOME": str(home),
        "PATH": "/usr/bin:/bin",
        "PYTHONNOUSERSITE": "1",
        "UV_OFFLINE": "1",
        "UV_NO_CONFIG": "1",
        "UV_PYTHON_DOWNLOADS": "never",
    })
    response = subprocess.run([str(binary), flag], cwd=home,
                              capture_output=True, text=True,
                              env=env, timeout=140, check=False)
    if should_succeed and response.returncode != 0:
        raise AssertionError(
            f"{flag} failed (exit {response.returncode}): "
            f"{response.stderr[-500:]}"
        )
    if not should_succeed:
        assert response.returncode != 0, f"{flag} unexpectedly succeeded"
        return response.stderr
    result = json.loads(response.stdout)
    assert isinstance(result, dict) and result.get("status"), result
    return result


def smoke(binary: Path, archive: Path):
    if not binary.is_file() or not os.access(binary, os.X_OK):
        raise AssertionError("compiled standalone binary unavailable")
    if not archive.is_file():
        raise AssertionError("pinned official archive unavailable")
    with tempfile.TemporaryDirectory(prefix="gpupanel-fresh-home-") as temp:
        home = Path(temp)
        cache = home / ".cache/gpupanel/uv"
        cache.mkdir(parents=True, mode=0o700)
        shutil.copyfile(archive, cache / ARCHIVE)

        doctor = call(binary, home, "--doctor")
        assert doctor["status"] == "READY", doctor
        assert doctor["requires"] == {
            "docker": False, "core": False, "kubernetes": False
        }, doctor

        preview = call(binary, home, "--uv-tool-plan")
        assert preview["status"] == "READY_FOR_APPROVAL", preview
        assert len(preview["planDigest"]) == 64
        no_project = home / "GPUPanel/projects/uv-python-starter"
        assert not no_project.exists()

        # A valid but unmatched digest must not create user directories.
        call(binary, home, "--uv-tool-install=" + "0" * 64,
             should_succeed=False)
        assert not (home / "GPUPanel/tools").exists()

        installed = call(binary, home,
                         "--uv-tool-install=" + preview["planDigest"])
        assert installed["status"] == "VERIFIED", installed
        tool = home / "GPUPanel/tools/uv" / UV_VERSION / "bin/uv"
        assert tool.is_file() and os.access(tool, os.X_OK)
        observed = call(binary, home, "--uv-tool-status")
        assert observed["status"] == "VERIFIED", observed

        project_preview = call(binary, home, "--uv-project-plan")
        assert project_preview["status"] == "READY_FOR_APPROVAL", project_preview
        assert len(project_preview["planDigest"]) == 64
        assert not no_project.exists()

        call(binary, home, "--uv-project-create=" + "0" * 64,
             should_succeed=False)
        assert not no_project.exists()
        created = call(binary, home,
                       "--uv-project-create=" + project_preview["planDigest"])
        assert created["status"] == "VERIFIED", created
        project = call(binary, home, "--uv-project-status")
        assert project["status"] == "VERIFIED", project
        for name in ("main.py", "README.md", "pyproject.toml", "uv.lock",
                     ".gpupanel-uv-project.json"):
            assert (no_project / name).is_file(), name

        # The newly generated repository-free project can actually run offline.
        proc = subprocess.run(
            [str(tool), "run", "--locked", "--offline", "--no-config",
             "--no-python-downloads", "--no-managed-python",
             "python", "main.py"],
            cwd=no_project,
            capture_output=True, text=True, timeout=70, check=False,
            env={**os.environ, "HOME": str(home), "UV_OFFLINE": "1",
                 "UV_NO_CONFIG": "1", "UV_PYTHON_DOWNLOADS": "never",
                 "UV_NO_MANAGED_PYTHON": "1"},
        )
        assert proc.returncode == 0, proc.stderr[-500:]
        assert "Hello from" in proc.stdout, proc.stdout

        # An existing project, including user edits, must not be overwritten.
        script = no_project / "main.py"
        script.write_text("print('user edit preserved')\n", encoding="utf-8")
        call(binary, home,
             "--uv-project-create=" + project_preview["planDigest"],
             should_succeed=False)
        assert script.read_text() == "print('user edit preserved')\n"
        drift = call(binary, home, "--uv-project-status")
        assert drift["status"] == "MODIFIED", drift

        print("FRESH_HOME_GOLDEN_PATH_PASS: standalone binary, verified "
              "upstream uv, SHA approval, offline project init/lock/run, "
              "non-overwrite after user edit, no Docker/Core/K8s")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("desktop_binary", type=Path)
    p.add_argument("pinned_archive", type=Path)
    args = p.parse_args()
    smoke(args.desktop_binary.resolve(), args.pinned_archive.resolve())


if __name__ == "__main__":
    main()
