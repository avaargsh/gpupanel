import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("gpupanel_catalog", ROOT / "scripts/gpupanel-catalog.py")
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)


class CatalogContract(unittest.TestCase):
    def setUp(self):
        self.index = catalog.load(ROOT / "catalog/index.json")

    def test_repo_index_only_declares_planned_features(self):
        self.assertEqual(len(self.index["revisions"]), 1)
        self.assertTrue(all(x["status"] in {"planned", "experimental"} for x in self.index["definitions"]))
        self.assertEqual(catalog.plan(self.index, "gpupanel.dev.python")["status"], "BLOCKED")

    def test_duplicate_definition_and_unknown_fields_rejected(self):
        v = copy.deepcopy(self.index)
        v["definitions"].append(copy.deepcopy(v["definitions"][0]))
        with self.assertRaises(catalog.CatalogError):
            catalog.validate(v)
        v = copy.deepcopy(self.index)
        v["definitions"][0]["command"] = "curl | bash"
        with self.assertRaises(catalog.CatalogError):
            catalog.validate(v)

    def test_unknown_shell_recipe_fails_closed(self):
        v = copy.deepcopy(self.index)
        v["revisions"] = [{"id":"rev1", "definitionId":"gpupanel.dev.python", "version":"1.0",
            "adapter":"host-package", "recipeId":"sh arbitrary", "source":{
              "provider":"official","uri":"https://example.invalid/p.tar.gz", "sha256":"a"*64}}]
        with self.assertRaises(catalog.CatalogError):
            catalog.validate(v)

    def test_https_and_checksum_gate_even_for_approved_recipe(self):
        v = copy.deepcopy(self.index)
        v["revisions"] = [{"id":"rev1", "definitionId":"gpupanel.dev.python", "version":"1.0",
            "adapter":"verified-asset", "recipeId":"test-static-fixture", "source":{
              "provider":"official","uri":"http://example.invalid/pkg", "sha256":"a"*64}}]
        with self.assertRaises(catalog.CatalogError):
            catalog.validate(v, catalog.APPROVED_RECIPES | frozenset({"test-static-fixture"}))
        v["revisions"][0]["source"]["uri"]="https://example.invalid/pkg"
        v["revisions"][0]["id"]=catalog.revision_digest(v["revisions"][0])
        catalog.validate(v, catalog.APPROVED_RECIPES | frozenset({"test-static-fixture"}))
        v["revisions"][0]["source"]["sha256"]="a"
        with self.assertRaises(catalog.CatalogError):
            catalog.validate(v, catalog.APPROVED_RECIPES | frozenset({"test-static-fixture"}))

    def test_revision_id_detects_content_mutation(self):
        v = copy.deepcopy(self.index)
        item = {"id":"placeholder", "definitionId":"gpupanel.dev.python",
                "version":"1.0.0", "adapter":"verified-asset",
                "recipeId":"test-static-fixture", "source":{"provider":"official",
                "uri":"https://example.invalid/fixture.tar.gz", "sha256":"a"*64}}
        item["id"] = catalog.revision_digest(item)
        v["revisions"].append(item)
        catalog.validate(v, catalog.APPROVED_RECIPES | frozenset({"test-static-fixture"}))
        item["version"] = "1.0.1"
        with self.assertRaises(catalog.CatalogError):
            catalog.validate(v, catalog.APPROVED_RECIPES | frozenset({"test-static-fixture"}))

    def test_cli_verify_browse_and_plan_read_only(self):
        with redirect_stdout(StringIO()) as out:
            self.assertEqual(catalog.main(["verify"]), 0)
        self.assertFalse(json.loads(out.getvalue())["trustRootVerified"])
        with redirect_stdout(StringIO()) as out:
            self.assertEqual(catalog.main(["list"]), 0)
        self.assertGreater(len(json.loads(out.getvalue())["definitions"]), 0)
        with redirect_stdout(StringIO()) as out:
            self.assertEqual(catalog.main(["plan","gpupanel.apps.compose"]), 2)
        self.assertFalse(json.loads(out.getvalue())["executed"])

    def test_duplicate_json_keys_rejected(self):
        with tempfile.TemporaryDirectory() as t:
            p=Path(t)/"index.json"
            p.write_text('{"schemaVersion":1,"definitions":[],"revisions":[],"revisions":[]}')
            with self.assertRaises(catalog.CatalogError):
                catalog.load(p)


if __name__ == "__main__":
    unittest.main()
