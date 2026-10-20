"""Protocol-level subprocess fakes: no real Codex credentials or network."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

FILE = Path(__file__).resolve().parents[2] / "scripts/gpupanel-codex-appserver.py"
spec = importlib.util.spec_from_file_location("gpupanel_appserver_probe", FILE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

THREAD = "123e4567-e89b-12d3-a456-426614174000"
FAKE = r"""
import json
import sys
frames = []
for line in sys.stdin:
    req = json.loads(line)
    frames.append(req)
    if req.get("method") == "initialize":
        print(json.dumps({"id": req["id"], "result": {"userAgent": "fake"}}), flush=True)
    if req.get("method") == "thread/list":
        assert [x["method"] for x in frames] == ["initialize", "initialized", "thread/list"]
        assert req["params"]["useStateDbOnly"] is True
        assert req["params"]["limit"] == 25
        print(json.dumps({"method": "thread/status/changed",
                          "params": {"preview": "SECRET_NOTIFICATION_DO_NOT_EXPORT"}}), flush=True)
        print(json.dumps({"id": req["id"], "result": {
            "data": [{"id": "123e4567-e89b-12d3-a456-426614174000",
                      "createdAt": 1792490400, "cwd": "/home/ubuntu/my-project",
                      "preview": "SECRET_PROMPT_DO_NOT_EXPORT",
                      "status": {"type": "notLoaded"}}],
            "nextCursor": "private-cursor-token"
        }}), flush=True)
        break
"""


class AppServerProbeTests(unittest.TestCase):
    def test_protocol_handshake_filter_and_explicit_unknown(self):
        result = module.probe([sys.executable, "-u", "-c", FAKE])
        self.assertEqual(result["schemaVersion"], 2)
        self.assertEqual(result["source"], "local-user-codex-appserver")
        self.assertEqual(result["observerScope"], "new-app-server-process")
        self.assertTrue(result["hasMore"])
        self.assertFalse(result["liveStatusVerified"])
        self.assertEqual(result["sessions"], [{
            "sessionId": THREAD,
            "runtimeKind": "codex", "projectLabel": "my-project",
            "startedAt": "2026-10-20T07:20:00Z", "liveness": "unknown",
            "observerStatus": "notLoaded",
        }])
        serialized = json.dumps(result)
        self.assertNotIn("SECRET", serialized)
        self.assertNotIn("/home/", serialized)
        self.assertNotIn("private-cursor-token", serialized)

    def test_rejects_invalid_status_and_oversize(self):
        base = {
            "data": [{
                "id": THREAD, "createdAt": 1792490400, "status": {"type": "active"},
                "preview": "SECRET",
            }],
            "nextCursor": None,
        }
        self.assertEqual(module.project_threads(base)["sessions"][0]["liveness"], "unknown")
        for invalid in [
            {"data": [{**base["data"][0], "status": {"type": "running"}}]},
            {"data": [{**base["data"][0], "id": "bad/value"}]},
            {"data": [base["data"][0], base["data"][0]]},
            {"data": [base["data"][0]] * 26},
            {"data": [base["data"][0]], "nextCursor": 7},
            {"data": [{**base["data"][0], "createdAt": "2026-10-20"}]},
        ]:
            with self.subTest(invalid=str(invalid)[:80]):
                with self.assertRaises(module.ProbeUnavailable):
                    module.project_threads(invalid)

    def test_protocol_rejection_is_not_empty_success(self):
        mock = r"""
import json, sys
for line in sys.stdin:
    request = json.loads(line)
    if request["method"] == "initialize":
        print(json.dumps({"id": 1, "result": {}}), flush=True)
    if request["method"] == "thread/list":
        print(json.dumps({"id": 2, "error": {"code": -32603, "message": "state db unavailable"}}),
              flush=True)
        break
"""
        with self.assertRaises(module.ProbeUnavailable):
            module.probe([sys.executable, "-u", "-c", mock])

    def test_protocol_timeout_and_cleanup(self):
        mock = "import time; time.sleep(5)"
        with patch.object(module, "TIMEOUT_SECONDS", 0.1):
            with self.assertRaises(module.ProbeUnavailable):
                module.probe([sys.executable, "-u", "-c", mock])

    def test_non_root_same_uid_fence(self):
        with patch.object(module.os, "geteuid", return_value=0):
            with self.assertRaises(module.ProbeUnavailable):
                module.require_local_user()
        with patch.object(module.os, "geteuid", return_value=1000), \
             patch.object(module.os, "getuid", return_value=1001):
            with self.assertRaises(module.ProbeUnavailable):
                module.require_local_user()


if __name__ == "__main__":
    unittest.main()
