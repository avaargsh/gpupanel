"""Python/Torch doctor contracts; no PyTorch or CUDA dependency needed in CI."""
import importlib.metadata
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import Mock

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location(
    "gpupanel_python_doctor_test", ROOT / "scripts/gpupanel-python-doctor.py"
)
doctor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(doctor)


def payload(*, available=True, count=1, cuda="12.4", hip=None):
    return json.dumps({
        "available": available,
        "deviceCount": count,
        "torchVersion": "2.6.0+cu124",
        "cudaBuild": cuda,
        "hipBuild": hip,
    })


class PythonDoctorTest(unittest.TestCase):
    def test_default_never_imports_torch_or_spawns_process(self):
        calls = []
        def denied(*args, **kwargs):
            calls.append(args)
            raise AssertionError("unexpected subprocess")
        result = doctor.inspect(
            False, reader=lambda _: "2.6.0+cu124", runner=denied
        )
        self.assertEqual(calls, [])
        self.assertEqual(result["torch"]["status"], "INSTALLED_UNVERIFIED")
        self.assertEqual(result["runtime"]["status"], "NOT_CHECKED")
        self.assertFalse(result["toolkitVerified"])
        self.assertFalse(result["torchKernelVerified"])
        self.assertFalse(result["environmentModified"])
        self.assertFalse(result["installPerformed"])

    def test_missing_torch_dist_is_not_a_runtime_failure(self):
        def missing(_):
            raise importlib.metadata.PackageNotFoundError("torch")
        result = doctor.inspect(reader=missing)
        self.assertEqual(result["torch"]["status"], "NOT_INSTALLED")
        self.assertEqual(result["runtime"]["status"], "NOT_CHECKED")

    def test_unknown_distribution_and_untrusted_version_are_not_accepted(self):
        self.assertEqual(doctor.package_metadata(lambda _: "torch\nSECRET")["status"], "UNKNOWN")
        def failure(_):
            raise OSError("private host path")
        self.assertEqual(doctor.package_metadata(failure)["status"], "UNKNOWN")

    def test_explicit_optin_runs_only_selected_python_isolated_and_bounded(self):
        calls = []
        def runner(command, **kwargs):
            calls.append((command, kwargs))
            return Mock(returncode=0, stdout=payload(), stderr="secret")
        result = doctor.inspect(
            True, reader=lambda _: "2.6.0", runner=runner, executable="/usr/bin/python3"
        )
        self.assertEqual(result["runtime"]["status"], "ACCELERATOR_AVAILABLE")
        self.assertEqual(result["runtime"]["deviceCount"], 1)
        self.assertEqual(result["runtime"]["build"]["cudaBuild"], "12.4")
        self.assertEqual(result["environmentModified"], "UNKNOWN")
        command, kwargs = calls[0]
        self.assertEqual(command[:4], ["/usr/bin/python3", "-I", "-B", "-c"])
        self.assertEqual(kwargs["timeout"], doctor.TIMEOUT)
        self.assertFalse(kwargs["check"])
        self.assertTrue(kwargs["capture_output"])
        self.assertNotIn("PYTHONPATH", kwargs["env"])
        self.assertNotIn("PYTHONHOME", kwargs["env"])
        self.assertEqual(kwargs["env"]["PYTHONDONTWRITEBYTECODE"], "1")

    def test_cpu_only_and_hip_runtime_are_not_claimed_as_cuda_toolkit(self):
        cpu = doctor.classify_runtime(payload(available=False, count=0, cuda=None))
        self.assertEqual(cpu["status"], "ACCELERATOR_UNAVAILABLE")
        self.assertFalse(cpu["build"]["cudaBuild"])
        hip = doctor.classify_runtime(payload(cuda=None, hip="6.2"))
        self.assertEqual(hip["status"], "ACCELERATOR_AVAILABLE")
        self.assertEqual(hip["build"]["hipBuild"], "6.2")

    def test_invalid_or_ambiguous_payload_is_rejected(self):
        variants = [
            "", "warning\n" + payload(), "x" * (doctor.MAX_OUTPUT + 1),
            json.dumps([]),
            json.dumps({"available": True}),
            payload(available=True, count=0),
            payload(available=False, count=2),
            payload(available=True, count=300),
            payload(cuda="12.4\nprivate"),
            json.dumps({"available": 1, "deviceCount": 1, "torchVersion": "2.6",
                        "cudaBuild": "12.4", "hipBuild": None}),
        ]
        for value in variants:
            with self.subTest(value=value[:30]):
                self.assertEqual(doctor.classify_runtime(value)["status"], "INVALID_RESPONSE")

    def test_failed_import_timeout_and_oserror_return_no_stderr(self):
        def import_failure(*a, **k):
            return Mock(returncode=2, stdout="", stderr="/home/user/secret")
        self.assertEqual(
            doctor.torch_runtime(True, runner=import_failure)["status"], "IMPORT_OR_RUNTIME_FAILED"
        )
        def timeout(*a, **k):
            raise subprocess.TimeoutExpired("python", timeout=doctor.TIMEOUT)
        self.assertEqual(doctor.torch_runtime(True, runner=timeout)["status"], "TIMEOUT")
        def unavailable(*a, **k):
            raise OSError("/home/user/secret")
        self.assertEqual(doctor.torch_runtime(True, runner=unavailable)["status"], "UNAVAILABLE")


if __name__ == "__main__":
    unittest.main()
