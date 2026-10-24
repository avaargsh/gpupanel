"""Durable host lifecycle journal contract; no privileged host mutation."""
from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest

ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "scripts/gpupanel-lifecycle-operation.py"
SPEC = importlib.util.spec_from_file_location("gpupanel_lifecycle_operation", MODULE_PATH)
journal = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(journal)

ARTIFACT = "a" * 64
EVIDENCE = "b" * 64


def binding_digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


class LifecycleJournalContract(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "operations.db"
        self.owner = "session:super-admin-1"
        self.target = "/opt/gpupanel"
        self.kind = "upgrade"
        self.key = "upgrade-v2-4-1"
        self.binding = binding_digest(b'{"version":"v2.4.1","channel":"stable"}')
        self.db = journal.open_journal(str(self.path))
        self.addCleanup(self.db.close)

    def claim(self, *, owner=None, key=None, binding=None, artifact=ARTIFACT):
        return journal.claim(
            self.db,
            owner=owner or self.owner,
            target=self.target,
            kind=self.kind,
            key=key or self.key,
            binding_sha256=binding or self.binding,
            artifact_sha256=artifact,
        )

    def advance(self, op, state, next_state, **fields):
        return journal.advance(
            self.db, owner=op["owner"], op_id=op["id"],
            expected_state=state, expected_revision=op["revision"],
            next_state=next_state, actor=op["owner"], **fields,
        )

    def test_claim_retry_replays_same_identity_and_never_creates_second_record(self):
        first = self.claim()
        retry = self.claim()
        self.assertTrue(first["created"])
        self.assertFalse(retry["created"])
        self.assertTrue(retry["replayed"])
        self.assertEqual(first["id"], retry["id"])
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM lifecycle_operations").fetchone()[0], 1)

    def test_reusing_key_for_different_binding_or_artifact_is_rejected(self):
        self.claim()
        with self.assertRaisesRegex(journal.JournalError, "different parameters"):
            self.claim(binding="c" * 64)
        with self.assertRaisesRegex(journal.JournalError, "different parameters"):
            self.claim(artifact="d" * 64)
        row = self.db.execute("SELECT state, revision FROM lifecycle_operations").fetchone()
        self.assertEqual(tuple(row), ("planned", 1))

    def test_transition_is_cas_guarded_and_exact_duplicate_is_idempotent(self):
        op = self.claim()
        result = self.advance(op, "planned", "preflight", stage="preflight-passed")
        replay = journal.advance(
            self.db, owner=op["owner"], op_id=op["id"],
            expected_state="planned", expected_revision=1, next_state="preflight",
            actor=op["owner"], stage="preflight-passed",
        )
        self.assertTrue(replay["replayed"])
        self.assertEqual(result["revision"], replay["revision"])
        with self.assertRaisesRegex(journal.JournalError, "revision changed"):
            journal.advance(
                self.db, owner=op["owner"], op_id=op["id"],
                expected_state="planned", expected_revision=1, next_state="failed_no_mutation",
                actor=op["owner"], error_code="stale-call",
            )

    def test_artifact_digest_is_bound_once_and_cannot_drift(self):
        op = self.claim(artifact="")
        op = self.advance(op, "planned", "preflight")
        op = self.advance(op, "preflight", "plan_reviewed")
        op = self.advance(op, "plan_reviewed", "backup_sealed",
                          evidence_sha256=EVIDENCE, artifact_sha256=ARTIFACT)
        self.assertEqual(op["artifact_sha256"], ARTIFACT)
        replay = self.claim(artifact="")
        self.assertEqual(replay["id"], op["id"])
        self.assertEqual(replay["artifact_sha256"], ARTIFACT)
        self.assertFalse(replay["created"])
        with self.assertRaisesRegex(journal.JournalError, "different artifact"):
            self.advance(op, "backup_sealed", "applying",
                         artifact_sha256="c" * 64)

    def test_unknown_outcome_cannot_be_reopened_without_evidence_reconciliation(self):
        op = self.claim()
        op = self.advance(op, "planned", "preflight")
        op = self.advance(op, "preflight", "plan_reviewed")
        op = self.advance(op, "plan_reviewed", "applying")
        op = self.advance(op, "applying", "unknown", error_code="worker_lost")
        with self.assertRaisesRegex(journal.JournalError, "forbidden"):
            self.advance(op, "unknown", "applying")
        with self.assertRaisesRegex(journal.JournalError, "evidence digest"):
            journal.advance(
                self.db, owner=op["owner"], op_id=op["id"],
                expected_state="unknown", expected_revision=op["revision"],
                next_state="rolled_back", actor="operator:alice", reconcile=True,
            )
        reconciled = journal.advance(
            self.db, owner=op["owner"], op_id=op["id"],
            expected_state="unknown", expected_revision=op["revision"],
            next_state="rolled_back", actor="operator:alice",
            evidence_sha256=EVIDENCE, reconcile=True,
        )
        self.assertEqual(reconciled["state"], "rolled_back")
        retry = self.claim()
        self.assertEqual(retry["id"], op["id"])
        self.assertEqual(retry["state"], "rolled_back")
        self.assertFalse(retry["created"])

    def test_terminal_success_and_backup_seal_require_evidence_digest(self):
        op = self.claim()
        op = self.advance(op, "planned", "preflight")
        op = self.advance(op, "preflight", "plan_reviewed")
        with self.assertRaisesRegex(journal.JournalError, "evidence digest"):
            self.advance(op, "plan_reviewed", "backup_sealed")
        op = self.advance(op, "plan_reviewed", "backup_sealed", evidence_sha256=EVIDENCE)
        with self.assertRaisesRegex(journal.JournalError, "evidence digest"):
            self.advance(op, "backup_sealed", "applying", evidence_sha256="not-a-digest")

    def test_operation_and_append_only_history_survive_database_reopen(self):
        op = self.claim()
        op = self.advance(op, "planned", "preflight")
        self.db.close()
        self.db = journal.open_journal(str(self.path))
        self.addCleanup(self.db.close)
        read = journal.get_operation(self.db, self.owner, op["id"])
        events = journal.history(self.db, self.owner, op["id"])
        self.assertEqual(read["id"], op["id"])
        self.assertEqual(read["state"], "preflight")
        self.assertEqual([event["sequence"] for event in events], [1, 2])
        self.assertEqual(events[-1]["to_state"], "preflight")

    def test_foreign_owner_cannot_read_operation_or_history(self):
        op = self.claim()
        with self.assertRaisesRegex(journal.JournalError, "not visible"):
            journal.get_operation(self.db, "foreign-session", op["id"])
        with self.assertRaisesRegex(journal.JournalError, "not visible"):
            journal.history(self.db, "foreign-session", op["id"])

    def test_symlinked_ancestor_is_rejected_even_when_leaf_directory_is_real(self):
        real = Path(self.temp.name) / "real"
        leaf = real / "private"
        leaf.mkdir(parents=True)
        alias = Path(self.temp.name) / "alias"
        alias.symlink_to(real, target_is_directory=True)
        with self.assertRaisesRegex(journal.JournalError, "symlink"):
            journal.open_journal(str(alias / "private" / "operations.db"))

    def test_invalid_paths_symlinks_and_permissive_journal_are_rejected(self):
        with self.assertRaisesRegex(journal.JournalError, "normalized absolute"):
            journal.open_journal("relative/operations.db")
        link = Path(self.temp.name) / "link"
        target_dir = Path(self.temp.name) / "target"
        target_dir.mkdir()
        link.symlink_to(target_dir, target_is_directory=True)
        with self.assertRaisesRegex(journal.JournalError, "symlink"):
            journal.open_journal(str(link / "operations.db"))
        permissive = Path(self.temp.name) / "permissive"
        permissive.mkdir(mode=0o700)
        db_path = permissive / "operations.db"
        db_path.touch(mode=0o600)
        permissive.chmod(0o755)
        with self.assertRaisesRegex(journal.JournalError, "mode 0700"):
            journal.open_journal(str(db_path))

    def test_concurrent_claims_across_connections_create_one_record(self):
        db_path = str(self.path)
        barrier = threading.Barrier(16)
        outcomes = []
        errors = []
        lock = threading.Lock()

        def worker():
            conn = None
            try:
                conn = journal.open_journal(db_path)
                barrier.wait(timeout=5)
                value = journal.claim(
                    conn, owner=self.owner, target=self.target, kind=self.kind,
                    key="parallel-claim", binding_sha256=self.binding,
                    artifact_sha256=ARTIFACT,
                )
                with lock:
                    outcomes.append(value)
            except Exception as exc:
                with lock:
                    errors.append(exc)
            finally:
                if conn is not None:
                    conn.close()

        workers = [threading.Thread(target=worker) for _ in range(16)]
        for worker_thread in workers:
            worker_thread.start()
        for worker_thread in workers:
            worker_thread.join(timeout=10)
        self.assertFalse(any(worker_thread.is_alive() for worker_thread in workers))
        self.assertEqual(errors, [])
        self.assertEqual(sum(bool(value["created"]) for value in outcomes), 1)
        self.assertEqual(len({value["id"] for value in outcomes}), 1)


if __name__ == "__main__":
    unittest.main()
