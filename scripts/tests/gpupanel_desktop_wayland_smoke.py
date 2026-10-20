#!/usr/bin/env python3
"""Nested Wayland smoke for the *real compiled* GPUPanel Desktop binary.

Run with xvfb-run + dbus-run-session. Weston uses X11 only as an output
backend; the *application* is forced to GDK_BACKEND=wayland and a private
Wayland socket. This is neither a GNOME session nor production WebKit
sandbox acceptance; the sandbox debug exception is restricted to Actions.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time

SOCKET_NAME = "gpupanel-wayland-smoke"


class WaylandSmokeFailure(Exception):
    pass


def check_socket(path: Path, compositor: subprocess.Popen, seconds=20) -> None:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if compositor.poll() is not None:
            raise WaylandSmokeFailure(
                f"Weston exited before Wayland socket readiness: rc={compositor.returncode}"
            )
        if path.is_socket():
            probe = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            probe.settimeout(2)
            try:
                probe.connect(str(path))
                return
            except OSError:
                pass
            finally:
                probe.close()
        time.sleep(0.25)
    raise WaylandSmokeFailure("nested Wayland socket did not become available")


def check_window(binary: Path, environment: dict[str, str],
                 screenshot: Path, logfile: Path) -> None:
    with logfile.open("xb") as output:
        app = subprocess.Popen(
            [str(binary)], env=environment, cwd=environment["HOME"],
            stdout=output, stderr=subprocess.STDOUT, start_new_session=True,
        )
        try:
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                if app.poll() is not None:
                    raise WaylandSmokeFailure(
                        f"native Wails process exited early: rc={app.returncode}"
                    )
                observed = logfile.read_text(encoding="utf-8", errors="replace")[-300000:]
                if ("AssetFileServerFS" in observed and "file=app.js" in observed
                        and ("xdg_toplevel" in observed or "wl_surface" in observed)):
                    break
                time.sleep(0.5)
            else:
                raise WaylandSmokeFailure(
                    "no native Wayland surface + Wails app asset request in 30s"
                )
            # Give WebKit the chance to survive initial navigation/JS startup.
            time.sleep(3)
            if app.poll() is not None:
                raise WaylandSmokeFailure("Wails process exited after WebKit navigation")
            proc = subprocess.run(
                ["scrot", "-z", str(screenshot)],
                capture_output=True, text=True, timeout=8, check=False,
            )
            if proc.returncode or not screenshot.is_file():
                raise WaylandSmokeFailure("could not capture nested Weston display")
            with screenshot.open("rb") as stream:
                if stream.read(8) != b"\x89PNG\r\n\x1a\n":
                    raise WaylandSmokeFailure("invalid nested compositor screenshot")
            if screenshot.stat().st_size < 1024:
                raise WaylandSmokeFailure("nested compositor screenshot too small")
            print("NESTED_WAYLAND_PASS: Wails/GTK Wayland surface and WebView "
                  "assets observed, native process alive, screenshot captured. "
                  "This does NOT prove GNOME or normal WebKit sandbox acceptance.")
        finally:
            app.terminate()
            try:
                app.wait(timeout=5)
            except subprocess.TimeoutExpired:
                app.kill()
                app.wait(timeout=3)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("binary", type=Path)
    parser.add_argument("screenshot", type=Path)
    args = parser.parse_args()
    binary = args.binary.resolve()
    screenshot = args.screenshot.resolve()
    if not binary.is_file() or not os.access(binary, os.X_OK):
        raise WaylandSmokeFailure("compiled desktop binary not executable")
    if not os.environ.get("DISPLAY"):
        raise WaylandSmokeFailure("Xvfb display required for Weston X11 output")
    if screenshot.exists() or screenshot.is_symlink():
        raise WaylandSmokeFailure("refuse to overwrite screenshot")
    if os.environ.get("GPUPANEL_CI_WEBKIT_UNSANDBOXED") != "1" or             os.environ.get("GITHUB_ACTIONS") != "true":
        raise WaylandSmokeFailure("Wayland smoke may only bypass WebKit sandbox in CI")

    with tempfile.TemporaryDirectory(prefix="gpupanel-wayland-smoke-") as temp:
        root = Path(temp)
        home = root / "home"
        runtime = root / "runtime"
        home.mkdir(mode=0o700)
        runtime.mkdir(mode=0o700)
        weston_log = screenshot.with_suffix(".weston.log")
        app_log = screenshot.with_suffix(".wayland.log")
        if any(p.exists() or p.is_symlink() for p in (weston_log, app_log)):
            raise WaylandSmokeFailure("refuse to replace existing diagnostics")
        environment = dict(os.environ)
        environment.update({
            "HOME": str(home),
            "XDG_RUNTIME_DIR": str(runtime),
            "WAYLAND_DISPLAY": SOCKET_NAME,
            "GDK_BACKEND": "wayland",
            "GSK_RENDERER": "cairo",
            "WEBKIT_DISABLE_DMABUF_RENDERER": "1",
            "WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS": "1",
            "WAYLAND_DEBUG": "1",
            "PYTHONNOUSERSITE": "1",
        })
        # Weston itself must use the X11 backend, not its own Wayland socket.
        weston_env = dict(environment)
        weston_env.pop("WAYLAND_DISPLAY")
        weston_env.pop("WAYLAND_DEBUG")
        with weston_log.open("xb") as logfile:
            weston = subprocess.Popen(
                ["weston", "--backend=x11-backend.so", "--shell=kiosk-shell.so",
                 "--no-config", "--use-pixman", "--width=1280",
                 "--height=800", "--socket=" + SOCKET_NAME],
                env=weston_env, cwd=home,
                stdout=logfile, stderr=subprocess.STDOUT,
                start_new_session=True,
            )
            try:
                check_socket(runtime / SOCKET_NAME, weston)
                check_window(binary, environment, screenshot, app_log)
            except Exception:
                for path in (weston_log, app_log):
                    if path.is_file():
                        raw = path.read_text(encoding="utf-8", errors="replace")
                        print(f"Diagnostic {path.name}:\n{raw[-2400:]}")
                raise
            finally:
                weston.terminate()
                try:
                    weston.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    weston.kill()
                    weston.wait(timeout=3)


if __name__ == "__main__":
    try:
        main()
    except (WaylandSmokeFailure, OSError, subprocess.TimeoutExpired) as exc:
        print(f"NESTED_WAYLAND_FAIL: {exc}", flush=True)
        raise SystemExit(1)
