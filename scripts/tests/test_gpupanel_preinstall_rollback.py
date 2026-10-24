"""Regression tests for the pre-install rollback inventory oracle."""
import importlib.util
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/install-test"))
spec = importlib.util.spec_from_file_location(
    "gpupanel_preinstall_rollback", ROOT / "scripts/install-test/preinstall-rollback-live.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PreinstallRollbackInventoryTests(unittest.TestCase):
    def setUp(self):
        self.before = {
            "containers": [],
            "networks": [
                "id-bridge-a|bridge|bridge|local",
                "id-host|host|host|local",
                "id-none|none|null|local",
                "id-custom|project_default|bridge|local",
            ],
            "volumes": [],
            "images": [],
        }

    def test_default_bridge_id_rotation_is_the_only_normalized_network_change(self):
        after = {**self.before, "networks": [
            "id-bridge-b|bridge|bridge|local",
            "id-host|host|host|local",
            "id-none|none|null|local",
            "id-custom|project_default|bridge|local",
        ]}
        self.assertEqual(module.inventory_digests(self.before),
                         module.inventory_digests(after))

    def test_custom_network_identity_membership_driver_and_scope_remain_strict(self):
        cases = (
            ["id-bridge-b|bridge|bridge|local", "id-host|host|host|local",
             "id-none|none|null|local", "id-custom-2|project_default|bridge|local"],
            ["id-bridge-b|bridge|bridge|local", "id-host|host|host|local",
             "id-none|none|null|local"],
            ["id-bridge-b|bridge|bridge|local", "id-host|host|host|local",
             "id-none|none|null|local", "id-custom|project_default|overlay|local"],
            ["id-bridge-b|bridge|bridge|local", "id-host|host|host|local",
             "id-none|none|null|local", "id-custom|project_default|bridge|global"],
        )
        baseline = module.inventory_digests(self.before)["networks"]
        for networks in cases:
            with self.subTest(networks=networks[-1]):
                changed = {**self.before, "networks": networks}
                self.assertNotEqual(module.inventory_digests(changed)["networks"], baseline)

    def test_malformed_or_duplicate_network_names_fail_closed(self):
        for networks in (
            ["private"],
            ["id-bridge|bridge|bridge|local", "other-id|bridge|bridge|local"],
            ["|bridge|bridge|local"],
        ):
            with self.subTest(networks=networks):
                with self.assertRaises(ValueError):
                    module.inventory_digests({**self.before, "networks": networks})


if __name__ == "__main__":
    unittest.main()
