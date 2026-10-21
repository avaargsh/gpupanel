"""Contract gate: the live VM stage writer and the evidence verifier agree.

`scripts/install-test/ci-live-vm.sh` appends every completed stage to
`.local/install-test/ci-stages.txt`; `scripts/install-test/ci-evidence.py`
verifies that file against its own `STAGES` tuple and fails the CI job when
the two lists disagree. The lists are maintained in two different files, so a
stage added to the writer alone silently turns a fully green live VM run into
`BLOCKED_OR_FAILED`. This module pins the writer's list to the verifier's list
without launching a VM.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path
import re
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "scripts/install-test/ci-evidence.py"
RUNNER = ROOT / "scripts/install-test/ci-live-vm.sh"

spec = importlib.util.spec_from_file_location("ci_evidence_contract", EVIDENCE)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

STAGE_CALL = re.compile(r"^stage '([a-z0-9_]+)'$", re.MULTILINE)


def writer_stages() -> list[str]:
    """Every stage the live VM runner appends, in the order it appends them."""
    return STAGE_CALL.findall(RUNNER.read_text(encoding="utf-8"))


class StageWriterVerifierContract(unittest.TestCase):
    def test_writer_and_verifier_stage_lists_are_identical(self):
        self.assertEqual(
            writer_stages(), list(audit.STAGES),
            "the live VM runner and the evidence verifier must list the same "
            "stages in the same order",
        )

    def test_real_writer_stage_sequence_is_accepted_by_the_verifier(self):
        """Replay the exact stage file the live VM runner writes."""
        stages = writer_stages()
        with tempfile.TemporaryDirectory() as temp:
            state = Path(temp)
            (state / "ci-stages.txt").write_text(
                "\n".join(stages) + "\n", encoding="utf-8"
            )
            report = audit.summarize(state, run_completed=True, source_sha="a" * 40)
        self.assertIs(report["stage_sequence_verified"], True)
        self.assertEqual(report["stages_completed"], stages)

    def test_extra_or_reordered_stages_still_fail_closed(self):
        stages = writer_stages()
        for broken in (stages + ["another"], stages[1:]):
            with self.subTest(stages=broken):
                with tempfile.TemporaryDirectory() as temp:
                    state = Path(temp)
                    (state / "ci-stages.txt").write_text(
                        "\n".join(broken) + "\n", encoding="utf-8"
                    )
                    report = audit.summarize(
                        state, run_completed=True, source_sha="a" * 40
                    )
                self.assertIs(report["stage_sequence_verified"], False)
                self.assertEqual(report["stages_completed"], [])


if __name__ == "__main__":
    unittest.main()
