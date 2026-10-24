package lifecycle

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

func validateClaim(req ClaimRequest) error {
	if err := validateOwner(req.Owner); err != nil { return err }
	if !filepath.IsAbs(req.Target) || filepath.Clean(req.Target) != req.Target ||
		strings.ContainsRune(req.Target, 0) || len(req.Target) == 0 || len(req.Target) > maxTargetBytes {
		return fmt.Errorf("%w: target must be a normalized absolute path", ErrInvalidRequest)
	}
	if !req.Kind.Valid() { return fmt.Errorf("%w: invalid operation kind %q", ErrInvalidRequest, req.Kind) }
	if !idempotencyKeyPattern.MatchString(req.IdempotencyKey) || len(req.IdempotencyKey) > maxKeyBytes {
		return fmt.Errorf("%w: idempotency key must be 1-128 safe ASCII characters", ErrInvalidRequest)
	}
	if len(req.Binding) == 0 || len(req.Binding) > maxBindingBytes {
		return fmt.Errorf("%w: canonical binding must be 1-%d bytes", ErrInvalidRequest, maxBindingBytes)
	}
	if req.ArtifactSHA256 != "" && !digestPattern.MatchString(req.ArtifactSHA256) {
		return fmt.Errorf("%w: artifact SHA-256 must be lowercase hexadecimal", ErrInvalidRequest)
	}
	return nil
}

func validateOwner(owner string) error {
	if owner == "" || len(owner) > maxOwnerBytes || strings.ContainsAny(owner, "\r\n\x00") {
		return fmt.Errorf("%w: owner is required and must be at most %d bytes", ErrInvalidRequest, maxOwnerBytes)
	}
	return nil
}

func validateTransitionRequest(req TransitionRequest) error {
	if err := validateOwner(req.Owner); err != nil { return err }
	if req.OperationID == "" || len(req.OperationID) > 36 {
		return fmt.Errorf("%w: invalid operation ID", ErrInvalidRequest)
	}
	if !req.ExpectedState.Valid() || !req.NextState.Valid() || req.ExpectedRevision == 0 {
		return fmt.Errorf("%w: invalid expected/next state or revision", ErrInvalidRequest)
	}
	if req.Actor == "" || len(req.Actor) > maxActorBytes || strings.ContainsAny(req.Actor, "\r\n\x00") {
		return fmt.Errorf("%w: actor is required and must be at most %d bytes", ErrInvalidRequest, maxActorBytes)
	}
	if len(req.Stage) > maxStageBytes || strings.ContainsAny(req.Stage, "\r\n\x00") {
		return fmt.Errorf("%w: invalid stage", ErrInvalidRequest)
	}
	if len(req.ErrorCode) > maxErrorCodeBytes || strings.ContainsAny(req.ErrorCode, "\r\n\x00") {
		return fmt.Errorf("%w: invalid error code", ErrInvalidRequest)
	}
	if req.EvidenceSHA256 != "" && !digestPattern.MatchString(req.EvidenceSHA256) {
		return fmt.Errorf("%w: invalid evidence digest", ErrInvalidRequest)
	}
	if req.ArtifactSHA256 != "" && !digestPattern.MatchString(req.ArtifactSHA256) {
		return fmt.Errorf("%w: invalid artifact digest", ErrInvalidRequest)
	}
	if (req.NextState == StateCompleted || req.NextState == StateRolledBack || req.NextState == StateBackupSealed) && req.EvidenceSHA256 == "" {
		return fmt.Errorf("%w: %s requires independently produced evidence", ErrInvalidRequest, req.NextState)
	}
	if (req.NextState == StateFailedNoMutation || req.NextState == StateUnknown || req.NextState == StateRecoveryRequired) && req.ErrorCode == "" {
		return fmt.Errorf("%w: %s requires a safe error code", ErrInvalidRequest, req.NextState)
	}
	return nil
}

func transitionAllowed(from, to State) bool {
	switch from {
	case StatePlanned:
		return to == StatePreflight || to == StateFailedNoMutation
	case StatePreflight:
		return to == StatePlanReviewed || to == StateFailedNoMutation
	case StatePlanReviewed:
		return to == StateBackupSealed || to == StateApplying || to == StateFailedNoMutation || to == StateRecoveryRequired
	case StateBackupSealed:
		return to == StateApplying || to == StateFailedNoMutation || to == StateRecoveryRequired
	case StateApplying:
		return to == StateVerifying || to == StateRolledBack || to == StateUnknown || to == StateRecoveryRequired
	case StateVerifying:
		return to == StateCompleted || to == StateRolledBack || to == StateUnknown || to == StateRecoveryRequired
	case StateUnknown:
		// Explicit evidence-bearing reconciliation uses the separate API below.
		return false
	case StateRecoveryRequired:
		return false
	default:
		return false
	}
}

func reconciliationTransitionAllowed(from, to State) bool {
	if to != StateCompleted && to != StateRolledBack && to != StateRecoveryRequired {
		return false
	}
	return from == StateUnknown || from == StateRecoveryRequired
}

func rowToOperation(rec operationRow) Operation {
	return Operation{
		ID: rec.ID, Owner: rec.Owner, Target: rec.Target, Kind: Kind(rec.Kind),
		IdempotencyKey: rec.IdempotencyKey, BindingSHA256: rec.BindingSHA256,
		ArtifactSHA256: rec.ArtifactSHA256, State: State(rec.State), Revision: rec.Revision,
		Stage: rec.Stage, ErrorCode: rec.ErrorCode, EvidenceSHA256: rec.EvidenceSHA256,
		CreatedAt: time.Unix(0, rec.CreatedAtNS).UTC(), UpdatedAt: time.Unix(0, rec.UpdatedAtNS).UTC(),
	}
}

func newOperationID() (string, error) {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", fmt.Errorf("lifecycle: generate operation identity: %w", err)
	}
	return "op_" + hex.EncodeToString(raw[:]), nil
}

func ensurePrivateDBFile(path string) error {
	info, err := os.Lstat(path)
	if err == nil {
		return validatePrivateDBInfo(info)
	}
	if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("lifecycle: inspect database path: %w", err)
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_RDWR|syscall.O_NOFOLLOW, 0600)
	if err != nil {
		if errors.Is(err, os.ErrExist) {
			// Resolve a concurrent creator once. Do not recurse on a raced path:
			// an attacker-controlled rename loop must not grow the stack.
			info, statErr := os.Lstat(path)
			if statErr != nil {
				return fmt.Errorf("lifecycle: inspect concurrently created database: %w", statErr)
			}
			return validatePrivateDBInfo(info)
		}
		return fmt.Errorf("lifecycle: create private database file: %w", err)
	}
	if err := file.Close(); err != nil { return err }
	info, err = os.Lstat(path)
	if err != nil { return fmt.Errorf("lifecycle: inspect newly created database: %w", err) }
	return validatePrivateDBInfo(info)
}

func validatePrivateDBInfo(info os.FileInfo) error {
	if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("lifecycle: database file must be a regular non-symlink file")
	}
	if info.Mode().Perm()&0077 != 0 {
		return fmt.Errorf("lifecycle: database file permissions must exclude group/other access")
	}
	return checkOwner(info, os.Geteuid())
}

func checkDirectoryAncestors(dir string, uid int) error {
	for current := filepath.Clean(dir); ; current = filepath.Dir(current) {
		info, err := os.Lstat(current)
		if err == nil {
			if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
				return fmt.Errorf("lifecycle: journal ancestor is redirected or not a directory")
			}
			statInfo, ok := info.Sys().(*syscall.Stat_t)
			if !ok || (int(statInfo.Uid) != uid && statInfo.Uid != 0) {
				return fmt.Errorf("lifecycle: journal ancestor is owned by an untrusted UID")
			}
			// The only writable ancestor accepted is root-owned sticky storage
			// such as /tmp; the journal's own directory is checked more strictly.
			if info.Mode().Perm()&0022 != 0 && !(statInfo.Uid == 0 && info.Mode()&os.ModeSticky != 0) {
				return fmt.Errorf("lifecycle: journal ancestor is group/world writable")
			}
		} else if !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("lifecycle: inspect journal ancestor: %w", err)
		}
		parent := filepath.Dir(current)
		if parent == current {
			break
		}
	}
	return nil
}

func checkOwner(info os.FileInfo, expectedUID int) error {
	statInfo, ok := info.Sys().(*syscall.Stat_t)
	if !ok || int(statInfo.Uid) != expectedUID {
		return fmt.Errorf("lifecycle: journal path is owned by another UID")
	}
	return nil
}

// Close to the product's state machine deliberately excludes automatic
// recovery. Only an independent observer may turn unknown/recovery_required
// into completed/rolled_back with evidence digest.
