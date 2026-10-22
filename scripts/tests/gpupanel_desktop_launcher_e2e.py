#!/usr/bin/env python3
"""Real Wails binary desktop-menu acceptance with no source or GUI dependency.

This validates the actual menu plan, user-level install, executable SHA binding,
exclusive publish and freedesktop desktop-file syntax in a fresh Ubuntu HOME.
It does not claim that GNOME has activated the entry or opened a WebView.
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

MENU_NAME = "gpupanel-workstation-preview.desktop"


def invoke(binary: Path, home: Path, arg: str, *, success: bool = True) -> dict:
    env = dict(os.environ)
    env["HOME"] = str(home)
    env.pop("DISPLAY", None)
    env.pop("WAYLAND_DISPLAY", None)
    process = subprocess.run(
        [str(binary), arg], cwd=home, env=env, text=True,
        capture_output=True, timeout=25, check=False,
    )
    if success:
        assert process.returncode == 0, (arg, process.stderr[-500:])
        data = json.loads(process.stdout)
        assert isinstance(data, dict) and data.get("status"), data
        return data
    assert process.returncode != 0, (
        "unexpectedly accepted stale/invalid launcher approval", arg,
        process.stdout[-300:],
    )
    return {}


def check(binary: Path) -> None:
    assert binary.is_file() and os.access(binary, os.X_OK), binary
    with tempfile.TemporaryDirectory(prefix="gpupanel-desktop-menu-e2e-") as td:
        home = Path(td) / "fresh-home"
        home.mkdir(mode=0o700)
        target_bin = home / "GPUPanel/desktop-preview/bin/gpupanel-desktop"
        target_bin.parent.mkdir(parents=True, mode=0o700)
        shutil.copy2(binary, target_bin)
        target_bin.chmod(0o700)
        target_menu = home / ".local/share/applications" / MENU_NAME

        review = invoke(target_bin, home, "--launcher-plan")
        assert review["status"] == "READY_FOR_APPROVAL", review
        assert review["binary"] == str(target_bin)
        assert review["target"] == str(target_menu)
        assert len(review["planDigest"]) == 64
        assert review["binarySHA256"] == hashlib.sha256(target_bin.read_bytes()).hexdigest()
        assert not target_menu.exists(), "menu dry run is unexpectedly mutating"

        invoke(target_bin, home, "--launcher-install=" + "0"*64, success=False)
        assert not target_menu.exists()

        # Append bytes to the executable without destroying ELF loading:
        # old approval must no longer authorize the same *path*.
        with target_bin.open("ab") as output:
            output.write(b"\nUNREVIEWED_DESKTOP_BINARY_CHANGE\n")
        changed = invoke(target_bin, home, "--launcher-plan")
        assert changed["binarySHA256"] != review["binarySHA256"]
        assert changed["planDigest"] != review["planDigest"]
        invoke(target_bin, home, "--launcher-install=" + review["planDigest"],
               success=False)
        assert not target_menu.exists()

        # Restore exact upstream artifact bytes and use the original approval.
        shutil.copy2(binary, target_bin)
        target_bin.chmod(0o700)
        restored = invoke(target_bin, home, "--launcher-plan")
        assert restored["planDigest"] == review["planDigest"]
        completed = invoke(target_bin, home,
                           "--launcher-install=" + review["planDigest"])
        assert completed["status"] == "VERIFIED", completed
        assert target_menu.stat().st_mode & 0o777 == 0o644
        assert not target_menu.is_symlink()
        text = target_menu.read_text(encoding="utf-8")
        assert f'Exec="{target_bin}"\n' in text, text
        assert "Terminal=false" in text
        assert not any(word in text for word in ("pkexec", "sudo ", "/bin/sh"))

        validator = subprocess.run(
            ["desktop-file-validate", str(target_menu)], capture_output=True,
            text=True, check=False, timeout=10,
        )
        assert validator.returncode == 0, validator.stderr
        present = invoke(target_bin, home, "--launcher-plan")
        assert present["status"] == "EXISTS_NO_OVERWRITE", present
        assert not present.get("planDigest")
        invoke(target_bin, home, "--launcher-install=" + review["planDigest"],
               success=False)
        assert target_menu.read_text(encoding="utf-8") == text

        print("DESKTOP_MENU_FRESH_HOME_PASS: binary-hash-bound approval, "
              "stale digest refusal, user-local desktop-file-validate, "
              "no overwrite, no root/Docker/Core/K8s; GNOME activation NOT TESTED")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("binary", type=Path)
    opts = parser.parse_args()
    check(opts.binary.resolve())
