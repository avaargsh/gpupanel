#!/usr/bin/env python3
"""Bounded Xvfb smoke for the *actual* Wails desktop executable.

This is an automated X11/WebKitGTK window-and-keyboard smoke, not a human
Wayland/GNOME acceptance or proof that every WebView action is functional.
Runs from a new HOME, without invoking Docker, Kubernetes, or Core.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time

WINDOW_RE = r"GPUPanel.*Local Workstation"


class SmokeFailure(Exception):
    pass


def checked(argv: list[str], *, timeout: int = 5) -> str:
    proc = subprocess.run(argv, capture_output=True, text=True,
                          check=False, timeout=timeout)
    if proc.returncode:
        raise SmokeFailure(f"command {argv[0]} failed (code={proc.returncode}): {proc.stderr[-500:]}")
    return proc.stdout.strip()


def await_window(app: subprocess.Popen, *, seconds: int = 30) -> str:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if app.poll() is not None:
            raise SmokeFailure(f"app exited before window appeared: code={app.returncode}")
        probe = subprocess.run(
            ["xdotool", "search", "--onlyvisible", "--name", WINDOW_RE],
            capture_output=True, text=True, timeout=3, check=False,
        )
        ids = [s for s in probe.stdout.splitlines() if re.fullmatch(r"[0-9]+", s)]
        if ids:
            return ids[0]
        time.sleep(0.5)
    raise SmokeFailure("no visible native window in 30s")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("binary", type=Path)
    parser.add_argument("screenshot", type=Path)
    args = parser.parse_args()
    binary = args.binary.resolve()
    if not binary.is_file() or not os.access(binary, os.X_OK):
        raise SmokeFailure("desktop binary unavailable")
    if not os.getenv("DISPLAY"):
        raise SmokeFailure("DISPLAY must be provided by xvfb-run")
    if args.screenshot.is_symlink() or args.screenshot.exists():
        raise SmokeFailure("refuse to overwrite screenshot")

    with tempfile.TemporaryDirectory(prefix="gpupanel-gui-test-") as td:
        root = Path(td)
        home = root / "fresh-home"
        home.mkdir(mode=0o700)
        env = dict(os.environ)
        env.update({
            "HOME": str(home),
            "GDK_BACKEND": "x11",
            "GSK_RENDERER": "cairo",
            "WEBKIT_DISABLE_DMABUF_RENDERER": "1",
            "PYTHONNOUSERSITE": "1",
        })
        # Openbox provides window focus semantics; Xvfb itself has no WM.
        wm = subprocess.Popen(["openbox", "--sm-disable"], env=env,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        app_log = root / "app.log"
        try:
            with app_log.open("wb") as output:
                app = subprocess.Popen([str(binary)], cwd=root, env=env,
                                       stdout=output, stderr=subprocess.STDOUT,
                                       start_new_session=True)
                try:
                    wid = await_window(app)
                    title = checked(["xdotool", "getwindowname", wid])
                    if "GPUPanel" not in title or "Local Workstation" not in title:
                        raise SmokeFailure(f"unexpected window title: {title!r}")
                    geometry = checked(["xdotool", "getwindowgeometry", "--shell", wid])
                    values = dict(line.split("=", 1) for line in geometry.splitlines() if "=" in line)
                    if int(values.get("WIDTH", "0")) < 800 or int(values.get("HEIGHT", "0")) < 560:
                        raise SmokeFailure("window rendered at unexpected size")
                    # The input path is exercised; no privileged or install button is activated.
                    checked(["xdotool", "windowactivate", "--sync", wid])
                    checked(["xdotool", "key", "--clearmodifiers", "Tab"])
                    time.sleep(2)
                    checked(["scrot", "-z", str(args.screenshot.resolve())])
                    if args.screenshot.stat().st_size < 1024 or args.screenshot.open("rb").read(8) != b"\x89PNG\r\n\x1a\n":
                        raise SmokeFailure("missing/invalid GUI screenshot")
                    if app.poll() is not None:
                        raise SmokeFailure(f"window process exited: {app.returncode}")
                    print("GUI_XVFB_WINDOW_PASS: title, geometry, keyboard dispatch, screenshot")
                    return 0
                finally:
                    app.terminate()
                    try:
                        app.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        app.kill()
                        app.wait(timeout=3)
        except Exception:
            if app_log.exists():
                print("Last app diagnostics:\n" + app_log.read_text(errors="replace")[-2000:])
            raise
        finally:
            wm.terminate()
            try:
                wm.wait(timeout=3)
            except subprocess.TimeoutExpired:
                wm.kill()
                wm.wait(timeout=3)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (SmokeFailure, OSError, ValueError, subprocess.TimeoutExpired) as err:
        print(f"GUI_XVFB_WINDOW_FAIL: {err}", flush=True)
        raise SystemExit(1)
