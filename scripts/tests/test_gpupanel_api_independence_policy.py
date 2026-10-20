"""Guard GPUPanel's selective API cleanup decision.

This is a source-contract test, not a claim that new HTTP routes are live.
"""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
ADR = ROOT / "docs/architecture/gpupanel-independent-api-v1.md"
INVENTORY = ROOT / "docs/api/legacy-route-inventory.md"
OPENAPI = ROOT / "docs/api/openapi-v1.draft.yaml"


class IndependentApiPolicy(unittest.TestCase):
    def test_clear_app_install_route_is_retained(self):
        adr = ADR.read_text(encoding="utf-8")
        inventory = INVENTORY.read_text(encoding="utf-8")
        self.assertIn("Canonical public prefix remains `/api/v1`", adr)
        self.assertIn("`POST /api/v1/apps/install` | **KEEP unchanged**", inventory)
        self.assertNotIn("/api/gpupanel/v1", adr + inventory)

    def test_generic_operation_dispatch_is_the_refactor_candidate(self):
        inventory = INVENTORY.read_text(encoding="utf-8")
        self.assertIn("`POST /api/v1/apps/installed/op` (`delete`) | **REFACTOR candidate**", inventory)
        self.assertIn("caller inventory", inventory)
        self.assertIn("real VM", inventory)

    def test_openapi_uses_existing_prefix_without_fake_mutation_routes(self):
        source = OPENAPI.read_text(encoding="utf-8")
        self.assertIn("  - url: /api/v1\n", source)
        self.assertIn("  /apps/installed/evidence/{installationId}:\n", source)
        self.assertNotIn("/api/gpupanel/v1", source)
        self.assertNotIn("  /app-installations:\n", source)
        self.assertNotIn("    post:\n", source)
        self.assertNotIn("    delete:\n", source)


if __name__ == "__main__":
    unittest.main()
