"""Tests for fail-closed kernel peer credential extraction."""
from __future__ import annotations

import importlib.util
from pathlib import Path
import socket
import struct
import sys
import unittest
from unittest.mock import Mock

FILE = Path(__file__).resolve().parents[1] / "gpupanel_os_principal.py"
spec = importlib.util.spec_from_file_location("gpupanel_os_principal", FILE)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
assert spec.loader is not None
spec.loader.exec_module(module)


class PeerCredentialTests(unittest.TestCase):
    def sock(self, pid=4321, uid=1000, gid=1000, raw=None):
        fake = Mock()
        fake.getsockopt.return_value = (
            raw if raw is not None else struct.pack("3i", pid, uid, gid)
        )
        return fake

    def test_reads_kernel_credentials(self):
        peer = module.read_peer_credentials(self.sock())
        self.assertEqual((peer.pid, peer.uid, peer.gid), (4321, 1000, 1000))

    def test_requires_explicit_exact_non_root_uid(self):
        self.assertEqual(module.require_peer_uid(self.sock(), 1000).uid, 1000)
        for expected in (0, -1, True, "1000", None):
            with self.subTest(expected=expected):
                with self.assertRaises(module.PeerIdentityUnavailable):
                    module.require_peer_uid(self.sock(), expected)
        with self.assertRaises(module.PeerIdentityUnavailable):
            module.require_peer_uid(self.sock(uid=1001), 1000)

    def test_rejects_root_and_invalid_kernel_identity(self):
        for credentials in ((4321, 0, 0), (0, 1000, 1000), (4321, 1000, -1)):
            with self.subTest(credentials=credentials):
                with self.assertRaises(module.PeerIdentityUnavailable):
                    module.read_peer_credentials(self.sock(*credentials))

    def test_rejects_malformed_payload_and_socket_errors(self):
        with self.assertRaises(module.PeerIdentityUnavailable):
            module.read_peer_credentials(self.sock(raw=b"short"))
        fake = self.sock()
        fake.getsockopt.side_effect = OSError("peer credentials unavailable")
        with self.assertRaises(module.PeerIdentityUnavailable):
            module.read_peer_credentials(fake)

    @unittest.skipUnless(hasattr(socket, "SO_PEERCRED"), "Linux SO_PEERCRED required")
    def test_kernel_credentials_over_unix_socketpair(self):
        left, right = socket.socketpair(socket.AF_UNIX, socket.SOCK_STREAM)
        try:
            peer = module.read_peer_credentials(left)
            self.assertEqual(peer.pid, __import__("os").getpid())
            self.assertEqual(peer.uid, __import__("os").geteuid())
            self.assertEqual(peer.gid, __import__("os").getegid())
        finally:
            left.close()
            right.close()


if __name__ == "__main__":
    unittest.main()
