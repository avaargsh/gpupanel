#!/usr/bin/env python3
"""User-local Python/PyTorch environment diagnostics; no installation or shell.

By default inspect the *current interpreter* and installed package metadata
without importing third-party packages. --probe-torch deliberately imports
PyTorch in a separate bounded subprocess; this may initialize a GPU runtime.
"""
from __future__ import annotations

import argparse
import importlib.metadata
import json
import os
import re
import subprocess
import sys

TIMEOUT = 12
MAX_OUTPUT = 4096
VERSION = re.compile(r"^[0-9A-Za-z!._+ -]{1,72}$")

# The isolated Python process cannot import the project directory or PYTHONPATH.
# It still loads installed third-party PyTorch code: operator must opt in.
TORCH_PROBE = """
import json
import torch
available = bool(torch.cuda.is_available())
device_count = int(torch.cuda.device_count()) if available else 0
print(json.dumps({
    "available": available,
    "deviceCount": device_count,
    "torchVersion": str(torch.__version__),
    "cudaBuild": getattr(torch.version, "cuda", None),
    "hipBuild": getattr(torch.version, "hip", None),
}, separators=(",", ":")))
"""


def version_string(value: object) -> str:
    if not isinstance(value, str) or not VERSION.fullmatch(value):
        return ""
    return value.strip()


def package_metadata(version_reader=importlib.metadata.version) -> dict:
    """Distribution metadata is not an import or a runtime readiness test."""
    try:
        version = version_string(version_reader("torch"))
    except importlib.metadata.PackageNotFoundError:
        return {"status": "NOT_INSTALLED", "version": ""}
    except (OSError, ValueError, TypeError):
        return {"status": "UNKNOWN", "version": ""}
    if not version:
        return {"status": "UNKNOWN", "version": ""}
    return {"status": "INSTALLED_UNVERIFIED", "version": version}


def classify_runtime(stdout: str) -> dict:
    """Accept one bounded, typed JSON object, not package-generated chatter."""
    if not stdout or len(stdout) > MAX_OUTPUT:
        return {"status": "INVALID_RESPONSE"}
    try:
        value = json.loads(stdout)
    except (ValueError, TypeError):
        return {"status": "INVALID_RESPONSE"}
    if not isinstance(value, dict) or set(value) != {
        "available", "deviceCount", "torchVersion", "cudaBuild", "hipBuild"
    }:
        return {"status": "INVALID_RESPONSE"}
    available = value["available"]
    count = value["deviceCount"]
    if (type(available) is not bool or type(count) is not int
            or count < 0 or count > 256
            or (available and count == 0) or (not available and count != 0)):
        return {"status": "INVALID_RESPONSE"}
    torch_version = version_string(value["torchVersion"])
    if not torch_version:
        return {"status": "INVALID_RESPONSE"}
    builds = {}
    for key in ("cudaBuild", "hipBuild"):
        raw = value[key]
        if raw is not None and not version_string(raw):
            return {"status": "INVALID_RESPONSE"}
        builds[key] = version_string(raw) if raw is not None else ""
    return {
        "status": "ACCELERATOR_AVAILABLE" if available else "ACCELERATOR_UNAVAILABLE",
        "torchVersion": torch_version,
        "deviceCount": count,
        "build": builds,
        "note": "torch.cuda availability is not a CUDA toolkit, kernel, training or inference acceptance test",
    }


def torch_runtime(probe: bool, *, runner=subprocess.run, executable: str | None = None) -> dict:
    if not probe:
        return {"status": "NOT_CHECKED"}
    interpreter = executable or sys.executable
    # Preserve the user's CUDA_VISIBLE_DEVICES and venv; -I isolates Python
    # import paths and avoids running untrusted PYTHONPATH/PYTHONSTARTUP code.
    env = os.environ.copy()
    for key in ("PYTHONPATH", "PYTHONHOME", "PYTHONSTARTUP", "PYTHONINSPECT"):
        env.pop(key, None)
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    try:
        result = runner(
            [interpreter, "-I", "-B", "-c", TORCH_PROBE],
            capture_output=True, text=True, check=False, timeout=TIMEOUT, env=env,
        )
    except subprocess.TimeoutExpired:
        return {"status": "TIMEOUT"}
    except OSError:
        return {"status": "UNAVAILABLE"}
    if result.returncode != 0:
        # Never return raw stderr; it may contain home paths or credentials.
        return {"status": "IMPORT_OR_RUNTIME_FAILED"}
    return classify_runtime(result.stdout.strip())


def inspect(probe_torch: bool = False, *, reader=importlib.metadata.version,
            runner=subprocess.run, executable: str | None = None) -> dict:
    python_version = ".".join(map(str, sys.version_info[:3]))
    return {
        "scope": "current Python interpreter / environment (not an arbitrary project venv)",
        "python": {"status": "DETECTED", "version": python_version},
        "torch": package_metadata(reader),
        "runtime": torch_runtime(probe_torch, runner=runner, executable=executable),
        "toolkitVerified": False,
        "torchKernelVerified": False,
        "installPerformed": False,
        "environmentModified": "UNKNOWN" if probe_torch else False,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="GPUPanel user-local Python/PyTorch doctor")
    parser.add_argument("--probe-torch", action="store_true",
                        help="opt in to bounded isolated PyTorch import and CUDA/HIP availability probe")
    parser.add_argument("--human", action="store_true", help="human-readable result")
    args = parser.parse_args(argv)
    report = inspect(args.probe_torch)
    if args.human:
        print("GPUPanel Python / PyTorch 体检（无安装操作）")
        print("Python:", report["python"]["version"], "(当前解释器)")
        print("PyTorch 包信息:", report["torch"]["status"], report["torch"]["version"])
        print("PyTorch 运行时:", report["runtime"]["status"])
        if report["runtime"].get("deviceCount") is not None:
            print("运行时可见设备:", report["runtime"]["deviceCount"])
        print("不代表 CUDA Toolkit、PyTorch GPU 算子或模型训练/推理已验收。")
        if not args.probe_torch:
            print("可选：--probe-torch 在独立受限进程中导入当前已安装的 PyTorch；可能初始化 CUDA。")
    else:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    # A valid diagnosis can report unavailable libraries; this is not installer
    # or PyTorch runtime acceptance, and this exit code must not be used as such.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
