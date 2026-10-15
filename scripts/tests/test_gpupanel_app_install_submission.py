"""Static behavioral contract for the inherited 1Panel app-install drawer.

The existing app form/API is reused, not a second installer implementation.
These source checks complement the real frontend build/type-check in CI; they
do not replace browser or live Docker integration tests.
"""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend/src/views/app-store/detail/install/index.vue"


class AppInstallSubmissionContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = SOURCE.read_text(encoding="utf-8")

    def test_single_flight_is_acquired_before_await(self):
        s = self.src
        begin = s.index("const handleSubmit = async () => {")
        end = s.index("const acceptParams = async", begin)
        submit = s[begin:end]
        self.assertIn("if (phase.value !== 'idle'", submit)
        self.assertLess(submit.index("phase.value = 'validating'"),
                        submit.index("await installFormRef.value?.validate()"))
        self.assertLess(submit.index("phase.value = 'submitting'"),
                        submit.index("await installApp(submitData)"))
        self.assertIn("phase.value === 'confirming'", submit)
        self.assertIn("phase.value = 'idle'", submit)

    def test_cancelled_confirmation_has_no_install_side_effect(self):
        s = self.src
        block = s.split("await ElMessageBox.confirm(i18n.global.t('app.installWarn')", 1)[1]
        self.assertLess(block.index("catch {"), block.index("phase.value = 'submitting'"))
        self.assertLess(block.index("return;"), block.index("const taskID = newUUID()"))
        self.assertIn("No task has been submitted", block)

    def test_unknown_http_outcome_is_not_reported_as_success(self):
        s = self.src
        self.assertIn("lastAttemptTaskID.value = taskID", s)
        self.assertIn("phase.value = 'uncertain'", s)
        self.assertIn("phase === 'uncertain' || !formData.appDetailId", s)
        self.assertIn("openTaskLog(lastAttemptTaskID.value)", s)
        self.assertIn("appInstallRetryConfirm", s)
        self.assertIn("if (phase.value === 'uncertain') {\n        open.value = true;", s)
        self.assertIn("if (phase.value === 'uncertain') {\n        // Preserve the unresolved task", s)
        self.assertIn("openTaskLog(taskID)", s)
        self.assertNotIn("} catch (error) {\n    }", s)
        self.assertLess(s.index("await installApp(submitData)"),
                        s.index("phase.value = 'uncertain'"))

    def test_initial_load_and_drawer_close_are_guarded(self):
        s = self.src
        self.assertIn(":confirm-before-close=\"loading\"", s)
        self.assertIn("@before-close=\"guardDrawerClose\"", s)
        self.assertIn("if (!loading.value) done()", s)
        self.assertIn("if (initializing.value) return;", s)
        self.assertIn("await installFormRef.value.initForm(appKey.value)", s)
        self.assertIn("appInstallLoadFailed", s)
        self.assertLess(s.index("initializing.value = true"), s.index("await nextTick()"))

    def test_version_detail_is_ready_before_initialization_finishes(self):
        source = (ROOT / "frontend/src/views/app-store/detail/form/index.vue").read_text(encoding="utf-8")
        self.assertIn("await getVersionDetail(defaultVersion)", source)
        self.assertIn("if (!appVersions.value.length) throw", source)
        self.assertIn("detailError.value = true", source)
        self.assertIn("if (formData.value.version === version)", source)
        self.assertIn("v-if=\"detailError\"", source)
        self.assertIn("detailError.value = false;", source)
        self.assertLess(source.index("formData.value.appDetailId = 0;", source.index("const getVersionDetail")),
                        source.index("const res = await getAppDetail(", source.index("const getVersionDetail")))

    def test_backend_permission_and_lifecycle_wiring_remain_inherited(self):
        s = self.src
        self.assertIn("await installApp(submitData)", s)
        self.assertIn("await installAppToNodes(submitData)", s)
        self.assertIn("TaskLog ref=\"taskLogRef\"", s)
        self.assertIn("initForm(appKey.value)", s)
        for lang in ("zh", "en"):
            content = (ROOT / f"frontend/src/lang/modules/{lang}.ts").read_text(encoding="utf-8")
            for key in ("appInstallUncertain:", "appInstallTaskHint:",
                        "appInstallReviewDone:", "appInstallRetryConfirm:",
                        "appInstallLoadFailed:"):
                self.assertIn(key, content)


if __name__ == "__main__":
    unittest.main()
