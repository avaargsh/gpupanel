#!/usr/bin/env python3
"""Durable GPUPanel lifecycle operation journal (shared SQLite schema).

The journal intentionally lives outside the install/data directory so ordinary
uninstall, upgrade rollback, and product data restore cannot erase the record
that a previous operation may already have changed the host. This script never
executes lifecycle actions; it only claims identities, advances state, and
returns redacted receipts.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import stat
import sys
import time

DEFAULT_DATABASE = "/var/lib/gpupanel-lifecycle/operations.db"
KINDS = {"install", "upgrade", "uninstall", "rollback", "backup", "restore"}
STATES = {
    "planned", "preflight", "plan_reviewed", "backup_sealed", "applying",
    "verifying", "completed", "failed_no_mutation", "rolled_back", "unknown",
    "recovery_required",
}
KEY_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
SHA_RE = re.compile(r"^[0-9a-f]{64}$")
MAX_OWNER = 128
MAX_TARGET = 512
MAX_STAGE = 128
MAX_ERROR_CODE = 128


class JournalError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def fail(code: str, message: str) -> None:
    raise JournalError(code, message)


def _owner_uid(path: Path) -> int | None:
    return path.lstat().st_uid


def _ensure_private_path(path: Path) -> None:
    if not path.is_absolute() or str(path) != os.path.normpath(str(path)):
        fail("INVALID_PATH", "journal path must be a normalized absolute path")
    directory = path.parent
    if not directory.exists():
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(directory, 0o700)
    try:
        d_info = directory.lstat()
    except OSError:
        fail("PATH_UNAVAILABLE", "journal directory cannot be inspected")
    if not stat.S_ISDIR(d_info.st_mode):
        fail("PATH_REDIRECTED", "journal directory is not an ordinary directory")
    if d_info.st_uid != os.geteuid() or (d_info.st_mode & 0o077):
        fail("PATH_OWNERSHIP", "journal directory must be owned by the current service UID and mode 0700")
    try:
        f_info = path.lstat()
    except FileNotFoundError:
        fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
        os.close(fd)
        f_info = path.lstat()
    except OSError:
        fail("PATH_UNAVAILABLE", "journal file cannot be inspected")
    if not stat.S_ISREG(f_info.st_mode) or f_info.st_uid != os.geteuid() or (f_info.st_mode & 0o077):
        fail("PATH_OWNERSHIP", "journal file must be an ordinary file owned by the current service UID and mode 0600")
    os.chmod(path, 0o600)


def _create_schema(db: sqlite3.Connection) -> None:
    db.execute("""
        CREATE TABLE IF NOT EXISTS lifecycle_operations (
            id TEXT PRIMARY KEY,
            owner TEXT NOT NULL,
            target TEXT NOT NULL,
            kind TEXT NOT NULL,
            idempotency_key TEXT NOT NULL,
            binding_sha256 TEXT NOT NULL,
            artifact_sha256 TEXT NOT NULL DEFAULT '',
            state TEXT NOT NULL,
            revision INTEGER NOT NULL,
            stage TEXT NOT NULL DEFAULT '',
            error_code TEXT NOT NULL DEFAULT '',
            evidence_sha256 TEXT NOT NULL DEFAULT '',
            created_at_ns INTEGER NOT NULL,
            updated_at_ns INTEGER NOT NULL
        )
    """)
    db.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_lifecycle_operation_identity
        ON lifecycle_operations(owner, target, kind, idempotency_key)
    """)
    db.execute("""
        CREATE INDEX IF NOT EXISTS idx_lifecycle_operation_state
        ON lifecycle_operations(state)
    """)
    db.execute("""
        CREATE TABLE IF NOT EXISTS lifecycle_operation_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            operation_id TEXT NOT NULL,
            sequence INTEGER NOT NULL,
            owner TEXT NOT NULL,
            from_state TEXT NOT NULL,
            to_state TEXT NOT NULL,
            actor TEXT NOT NULL DEFAULT '',
            stage TEXT NOT NULL DEFAULT '',
            error_code TEXT NOT NULL DEFAULT '',
            evidence_sha256 TEXT NOT NULL DEFAULT '',
            occurred_at_ns INTEGER NOT NULL
        )
    """)
    db.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_lifecycle_event_sequence
        ON lifecycle_operation_events(operation_id, sequence)
    """)
    db.execute("""
        CREATE INDEX IF NOT EXISTS idx_lifecycle_event_operation
        ON lifecycle_operation_events(operation_id)
    """)


def open_journal(path_text: str = DEFAULT_DATABASE) -> sqlite3.Connection:
    path = Path(path_text)
    if str(path) == DEFAULT_DATABASE and os.geteuid() != 0:
        fail("PRIVILEGE_REQUIRED", "the production lifecycle journal is root-only")
    _ensure_private_path(path)
    db = sqlite3.connect(str(path), timeout=10.0, isolation_level=None)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA busy_timeout=10000")
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA synchronous=FULL")
    _create_schema(db)
    return db


def _validate_owner(owner: str) -> None:
    if not owner or len(owner.encode()) > MAX_OWNER or any(c in owner for c in "\r\n\x00"):
        fail("INVALID_OWNER", "owner is required and must be at most 128 bytes")


def _validate_target(target: str) -> None:
    if not target or not target.startswith("/") or os.path.normpath(target) != target or len(target.encode()) > MAX_TARGET:
        fail("INVALID_TARGET", "target must be a normalized absolute path")


def _validate_key(key: str) -> None:
    if not KEY_RE.fullmatch(key):
        fail("INVALID_IDEMPOTENCY_KEY", "idempotency key must be 1-128 safe ASCII characters")


def _validate_sha(value: str, label: str, allow_empty: bool = True) -> None:
    if allow_empty and value == "":
        return
    if not SHA_RE.fullmatch(value):
        fail("INVALID_DIGEST", f"{label} must be lowercase SHA-256 hex")


def _receipt(row: sqlite3.Row, *, created: bool | None = None, replayed: bool | None = None) -> dict:
    fields = (
        "id", "owner", "target", "kind", "idempotency_key", "binding_sha256",
        "artifact_sha256", "state", "revision", "stage", "error_code",
        "evidence_sha256", "created_at_ns", "updated_at_ns",
    )
    data = {key: row[key] for key in fields}
    data["schema"] = "gpupanel.lifecycle-operation.v1"
    if created is not None:
        data["created"] = created
    if replayed is not None:
        data["replayed"] = replayed
    data["execution_disposition"] = "CREATED_OPERATION" if created else "OBSERVE_ONLY"
    return data


def claim(db: sqlite3.Connection, *, owner: str, target: str, kind: str, key: str,
          binding_sha256: str, artifact_sha256: str = "") -> dict:
    _validate_owner(owner)
    _validate_target(target)
    _validate_key(key)
    if kind not in KINDS:
        fail("INVALID_KIND", "unsupported lifecycle operation kind")
    _validate_sha(binding_sha256, "binding digest", allow_empty=False)
    _validate_sha(artifact_sha256, "artifact digest")
    now = time.time_ns()
    op_id = "op_" + secrets.token_hex(16)
    db.execute("BEGIN IMMEDIATE")
    try:
        cursor = db.execute("""
            INSERT INTO lifecycle_operations(
                id, owner, target, kind, idempotency_key, binding_sha256,
                artifact_sha256, state, revision, stage, error_code,
                evidence_sha256, created_at_ns, updated_at_ns
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'planned', 1, '', '', '', ?, ?)
            ON CONFLICT(owner, target, kind, idempotency_key) DO NOTHING
        """, (op_id, owner, target, kind, key, binding_sha256, artifact_sha256, now, now))
        created = cursor.rowcount == 1
        row = db.execute("""
            SELECT * FROM lifecycle_operations
            WHERE owner=? AND target=? AND kind=? AND idempotency_key=?
        """, (owner, target, kind, key)).fetchone()
        if row is None:
            fail("CLAIM_FAILED", "claim did not produce a durable operation")
        if not created and (row["binding_sha256"] != binding_sha256 or row["artifact_sha256"] != artifact_sha256):
            fail("BINDING_MISMATCH", "idempotency key is already bound to different parameters or artifact")
        if created:
            db.execute("""
                INSERT INTO lifecycle_operation_events(
                    operation_id, sequence, owner, from_state, to_state, actor,
                    stage, error_code, evidence_sha256, occurred_at_ns
                ) VALUES (?, 1, ?, '', 'planned', ?, '', '', '', ?)
            """, (op_id, owner, owner, now))
        db.execute("COMMIT")
        return _receipt(row, created=created, replayed=not created)
    except Exception:
        if db.in_transaction:
            db.execute("ROLLBACK")
        raise


def transition_allowed(source: str, target: str, *, reconcile: bool = False) -> bool:
    ordinary = {
        "planned": {"preflight", "failed_no_mutation"},
        "preflight": {"plan_reviewed", "failed_no_mutation"},
        "plan_reviewed": {"backup_sealed", "applying", "failed_no_mutation"},
        "backup_sealed": {"applying", "failed_no_mutation"},
        "applying": {"verifying", "rolled_back", "unknown", "recovery_required"},
        "verifying": {"completed", "rolled_back", "unknown", "recovery_required"},
    }
    if target in ordinary.get(source, set()):
        return True
    return reconcile and source in {"unknown", "recovery_required"} and target in {
        "completed", "rolled_back", "recovery_required"
    }


def advance(db: sqlite3.Connection, *, owner: str, op_id: str, expected_state: str,
            expected_revision: int, next_state: str, actor: str, stage: str = "",
            error_code: str = "", evidence_sha256: str = "", reconcile: bool = False) -> dict:
    _validate_owner(owner)
    if not op_id or len(op_id) > 36:
        fail("INVALID_OPERATION_ID", "operation ID is invalid")
    if expected_state not in STATES or next_state not in STATES or expected_revision < 1:
        fail("INVALID_STATE", "expected/next state or revision is invalid")
    if not actor or len(actor.encode()) > MAX_OWNER or any(c in actor for c in "\r\n\x00"):
        fail("INVALID_ACTOR", "actor is required")
    if len(stage.encode()) > MAX_STAGE or any(c in stage for c in "\r\n\x00"):
        fail("INVALID_STAGE", "stage is invalid")
    if len(error_code.encode()) > MAX_ERROR_CODE or any(c in error_code for c in "\r\n\x00"):
        fail("INVALID_ERROR_CODE", "error code is invalid")
    _validate_sha(evidence_sha256, "evidence digest")
    if next_state in {"completed", "rolled_back", "backup_sealed"} and not evidence_sha256:
        fail("EVIDENCE_REQUIRED", f"{next_state} requires an independent evidence digest")
    if next_state in {"failed_no_mutation", "unknown", "recovery_required"} and not error_code:
        fail("ERROR_CODE_REQUIRED", f"{next_state} requires a safe error code")
    if not transition_allowed(expected_state, next_state, reconcile=reconcile):
        fail("INVALID_TRANSITION", f"transition {expected_state} -> {next_state} is forbidden")

    db.execute("BEGIN IMMEDIATE")
    try:
        current = db.execute("SELECT * FROM lifecycle_operations WHERE id=? AND owner=?", (op_id, owner)).fetchone()
        if current is None:
            fail("NOT_FOUND", "operation is not visible to this owner")
        if current["revision"] == expected_revision + 1 and current["state"] == next_state:
            latest = db.execute("""
                SELECT * FROM lifecycle_operation_events WHERE operation_id=? AND sequence=?
            """, (op_id, current["revision"])).fetchone()
            if latest is not None and latest["from_state"] == expected_state and latest["to_state"] == next_state and                latest["actor"] == actor and latest["stage"] == stage and latest["error_code"] == error_code and                latest["evidence_sha256"] == evidence_sha256:
                db.execute("COMMIT")
                return _receipt(current, created=False, replayed=True)
        if current["state"] != expected_state or current["revision"] != expected_revision:
            fail("REVISION_CONFLICT", "operation state/revision changed; reconcile before retrying")
        next_revision = expected_revision + 1
        now = time.time_ns()
        cursor = db.execute("""
            UPDATE lifecycle_operations
            SET state=?, revision=?, stage=?, error_code=?, evidence_sha256=?, updated_at_ns=?
            WHERE id=? AND owner=? AND state=? AND revision=?
        """, (next_state, next_revision, stage, error_code, evidence_sha256, now,
              op_id, owner, expected_state, expected_revision))
        if cursor.rowcount != 1:
            fail("REVISION_CONFLICT", "state compare-and-swap rejected the transition")
        db.execute("""
            INSERT INTO lifecycle_operation_events(
                operation_id, sequence, owner, from_state, to_state, actor,
                stage, error_code, evidence_sha256, occurred_at_ns
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (op_id, next_revision, owner, expected_state, next_state, actor,
              stage, error_code, evidence_sha256, now))
        row = db.execute("SELECT * FROM lifecycle_operations WHERE id=?", (op_id,)).fetchone()
        db.execute("COMMIT")
        return _receipt(row, created=False, replayed=False)
    except Exception:
        if db.in_transaction:
            db.execute("ROLLBACK")
        raise


def get_operation(db: sqlite3.Connection, owner: str, op_id: str) -> dict:
    _validate_owner(owner)
    row = db.execute("SELECT * FROM lifecycle_operations WHERE id=? AND owner=?", (op_id, owner)).fetchone()
    if row is None:
        fail("NOT_FOUND", "operation is not visible to this owner")
    return _receipt(row, created=False, replayed=True)


def history(db: sqlite3.Connection, owner: str, op_id: str) -> list[dict]:
    get_operation(db, owner, op_id)
    rows = db.execute("""
        SELECT sequence, from_state, to_state, actor, stage, error_code,
               evidence_sha256, occurred_at_ns
        FROM lifecycle_operation_events WHERE operation_id=? AND owner=? ORDER BY sequence
    """, (op_id, owner)).fetchall()
    return [dict(row) for row in rows]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db-path", default=DEFAULT_DATABASE,
                        help=argparse.SUPPRESS)  # isolated test/interoperability path
    sub = parser.add_subparsers(dest="command", required=True)
    claim_parser = sub.add_parser("claim")
    claim_parser.add_argument("--owner", required=True)
    claim_parser.add_argument("--target", required=True)
    claim_parser.add_argument("--kind", required=True)
    claim_parser.add_argument("--key", required=True)
    claim_parser.add_argument("--binding-sha256", required=True)
    claim_parser.add_argument("--artifact-sha256", default="")
    advance_parser = sub.add_parser("advance")
    advance_parser.add_argument("--owner", required=True)
    advance_parser.add_argument("--id", required=True)
    advance_parser.add_argument("--expected-state", required=True)
    advance_parser.add_argument("--expected-revision", required=True, type=int)
    advance_parser.add_argument("--next-state", required=True)
    advance_parser.add_argument("--actor", required=True)
    advance_parser.add_argument("--stage", default="")
    advance_parser.add_argument("--error-code", default="")
    advance_parser.add_argument("--evidence-sha256", default="")
    advance_parser.add_argument("--reconcile", action="store_true")
    get_parser = sub.add_parser("get")
    get_parser.add_argument("--owner", required=True)
    get_parser.add_argument("--id", required=True)
    history_parser = sub.add_parser("history")
    history_parser.add_argument("--owner", required=True)
    history_parser.add_argument("--id", required=True)
    args = parser.parse_args(argv)
    db = None
    try:
        db = open_journal(args.db_path)
        if args.command == "claim":
            payload = claim(db, owner=args.owner, target=args.target, kind=args.kind, key=args.key,
                            binding_sha256=args.binding_sha256, artifact_sha256=args.artifact_sha256)
        elif args.command == "advance":
            payload = advance(
                db, owner=args.owner, op_id=args.id, expected_state=args.expected_state,
                expected_revision=args.expected_revision, next_state=args.next_state,
                actor=args.actor, stage=args.stage, error_code=args.error_code,
                evidence_sha256=args.evidence_sha256, reconcile=args.reconcile,
            )
        elif args.command == "get":
            payload = get_operation(db, args.owner, args.id)
        else:
            payload = {"schema": "gpupanel.lifecycle-operation-history.v1",
                       "operation_id": args.id, "events": history(db, args.owner, args.id)}
        print(json.dumps(payload, sort_keys=True))
        return 0
    except JournalError as exc:
        print(json.dumps({"schema": "gpupanel.lifecycle-operation-error.v1",
                          "error_code": exc.code, "message": str(exc)}, sort_keys=True), file=sys.stderr)
        return 2
    except (sqlite3.Error, OSError, ValueError) as exc:
        print(json.dumps({"schema": "gpupanel.lifecycle-operation-error.v1",
                          "error_code": "JOURNAL_FAILURE", "message": str(exc)}, sort_keys=True), file=sys.stderr)
        return 1
    finally:
        if db is not None:
            db.close()


if __name__ == "__main__":
    raise SystemExit(main())
