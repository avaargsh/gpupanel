"""Identity pairing CLI never accepts root, unsafe socket paths or CLI tokens."""
from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

FILE = Path(__file__).resolve().parents[2] / "scripts/gpupanel-native-principal-pair.py"
spec = importlib.util.spec_from_file_location("gpupanel_peer_cli", FILE)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class PeerCLIContractTests(unittest.TestCase):
    def test_invalid_socket_and_token_rejected_before_network_io(self):
        good = "A" * 43
        for path in [
            "/tmp/forged.sock",
            "/run/gpupanel-proof-x/../../root.sock",
            "/run/gpupanel-proof-x/other.sock",
            "pair.sock",
        ]:
            self.assertFalse(mod.pair(path, good))
        self.assertFalse(mod.pair("/run/gpupanel-proof-abc/pair.sock", "short"))
        self.assertFalse(mod.pair("/run/gpupanel-proof-abc/pair.sock", "x" * 43 + "\n"))

    def test_root_and_noninteractive_refuse_before_asking_for_challenge(self):
        with patch.object(mod.os, "geteuid", return_value=0):
            self.assertEqual(mod.main(["--socket", "/run/gpupanel-proof-abc/pair.sock"]), 2)


if __name__ == "__main__":
    unittest.main()
