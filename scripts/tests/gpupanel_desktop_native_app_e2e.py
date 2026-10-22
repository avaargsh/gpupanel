#!/usr/bin/env python3
"""Real-process local editor/terminal dispatch from the compiled desktop binary.

This proves the *exact native service dispatch* used by Wails, not GUI
readiness. Test substitutes are controlled user-owned executables and do not
invoke an IDE, shell, Docker, GPU, Kubernetes or remote GPUPanel Core.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time


def invoke(binary: Path, home: Path, bin_dir: Path, capture: Path,
           verb: str, *, success: bool) -> dict | str:
    env = dict(os.environ)
    env.update({
        "HOME": str(home),
        "PATH": str(bin_dir) + os.pathsep + "/usr/bin:/bin",
        "GPUPANEL_LAUNCH_CAPTURE": str(capture),
    })
    env.pop("DISPLAY", None)
    env.pop("WAYLAND_DISPLAY", None)
    proc = subprocess.run([str(binary), verb], env=env, cwd=home,
                          text=True, capture_output=True, timeout=20)
    if success:
        assert proc.returncode == 0, (verb, proc.returncode, proc.stderr[-450:])
        data = json.loads(proc.stdout)
        assert data["status"] == "LAUNCH_REQUESTED", data
        assert data["verifiedGUI"] is False, data
        assert data["requires"] == {
            "core": False, "docker": False, "kubernetes": False,
        }, data
        return data
    assert proc.returncode != 0, f"unexpected successful command: {verb}"
    return proc.stderr


def await_record(path: Path) -> dict:
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        if path.is_file():
            return json.loads(path.read_text())
        time.sleep(0.1)
    raise AssertionError(f"native process did not write record: {path.name}")


def test(binary: Path):
    assert binary.is_file() and os.access(binary, os.X_OK)
    with tempfile.TemporaryDirectory(prefix="gpupanel-native-app-e2e-") as tmp:
        home = Path(tmp) / "fresh-home"
        home.mkdir(mode=0o700)
        project = home / "GPUPanel/projects/uv-python-starter"
        project.mkdir(parents=True, mode=0o700)
        stubs = Path(tmp) / "bin"
        stubs.mkdir(mode=0o700)
        capture = Path(tmp) / "capture"
        capture.mkdir(mode=0o700)

        # These are test fixtures, NOT supplied in an end-user archive.
        fixture = """#!/usr/bin/python3
import json, os, pathlib, sys
name = pathlib.Path(sys.argv[0]).name
target = pathlib.Path(os.environ["GPUPANEL_LAUNCH_CAPTURE"]) / (name + ".json")
target.write_text(json.dumps({"argv": sys.argv[1:], "cwd": os.getcwd()}))
"""
        for name in ("gnome-terminal", "code"):
            executable = stubs / name
            executable.write_text(fixture)
            executable.chmod(0o700)

        terminal = invoke(binary, home, stubs, capture,
                          "--open-project-terminal=uv-python-starter", success=True)
        assert terminal["application"] == "gnome-terminal"
        assert terminal["directory"] == str(project)
        term_trace = await_record(capture / "gnome-terminal.json")
        assert term_trace["argv"] == ["--working-directory=" + str(project)], term_trace

        editor = invoke(binary, home, stubs, capture,
                        "--open-project-editor=uv-python-starter", success=True)
        assert editor["application"] == "code"
        assert editor["directory"] == str(project)
        ide_trace = await_record(capture / "code.json")
        assert ide_trace["argv"] == ["--new-window", str(project)], ide_trace

        before = {x.name: x.read_text() for x in capture.iterdir()}
        invoke(binary, home, stubs, capture,
               "--open-project-terminal=../invalid", success=False)
        invoke(binary, home, stubs, capture,
               "--open-project-editor=not-created", success=False)
        linked = project.parent / "linked"
        linked.symlink_to(project, target_is_directory=True)
        invoke(binary, home, stubs, capture,
               "--open-project-editor=linked", success=False)
        after = {x.name: x.read_text() for x in capture.iterdir()}
        assert before == after, "refused commands unexpectedly started an app"

        print("NATIVE_APP_DISPATCH_PASS: compiled binary invokes controlled "
              "terminal/IDE with exact project path, rejects traversal, "
              "missing and symlink projects; GUI readiness remains untested")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("binary", type=Path)
    args = parser.parse_args()
    test(args.binary.resolve())
