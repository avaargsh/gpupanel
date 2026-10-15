"""Catalog UI source contract — real browser/E2E is separately required."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
PATH = ROOT / "frontend/src/views/app-store/apps/index.vue"

class CatalogSearchContract(unittest.TestCase):
    def test_failure_empty_and_retry_are_distinct(self):
        src = PATH.read_text()
        for part in ("catalogError.value = true", "noApp.value = items.length === 0",
                     'role="alert"', "catalogRetry", "catalogClearFilters"):
            self.assertIn(part, src)
        self.assertNotIn("<NoApp v-if=", src)
    def test_latest_request_wins_and_loading_clears(self):
        src = PATH.read_text()
        self.assertIn("const requestId = ++latestCatalogRequest;", src)
        self.assertGreaterEqual(src.count("requestId !== latestCatalogRequest"), 2)
        self.assertIn("if (requestId === latestCatalogRequest) loading.value = false;", src)
        self.assertIn("tags: [...(req.tags || [])]", src)
    def test_search_filters_reset_page(self):
        src = PATH.read_text()
        self.assertIn("searchFromFilters()", src)
        self.assertIn("paginationConfig.currentPage = 1;", src)
        for lang in ("zh", "en"):
            locale = (ROOT / f"frontend/src/lang/modules/{lang}.ts").read_text()
            for field in ("catalogLoadFailed", "catalogRetry", "catalogEmpty", "catalogClearFilters"):
                self.assertIn(field + ":", locale)

if __name__ == "__main__":
    unittest.main()
