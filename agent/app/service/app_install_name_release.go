package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"time"

	"github.com/avaargsh/GPUPanel/agent/app/model"
	"github.com/avaargsh/GPUPanel/agent/app/task"
	"github.com/avaargsh/GPUPanel/agent/constant"
	"gorm.io/gorm"
)

var ErrAppInstallNameReleaseDenied = errors.New("name release denied: current owner, authorization or resource evidence is incomplete")

// appInstallNameReleaseRequest identifies a precise human reconciliation.
// It is NOT a permit: the operator ID is supplied by a separately trusted
// approval verifier, never by user-provided request JSON.
type appInstallNameReleaseRequest struct {
	RequestID   string
	Name        string
	OwnerTaskID string
}

// appInstallNameReleaseProbe is collected by a trusted observer on the
// actual target host. There is intentionally no shipped implementation or
// HTTP endpoint until independently verified Docker, Compose and filesystem
// observers exist. Tests inject simulated observations; those prove the CAS
// protocol, not real-world absence of resources.
type appInstallNameReleaseProbe struct {
	NameKey            string
	OwnerTaskID        string
	ObservedAt         time.Time
	DockerAbsent       bool
	ComposeAbsent      bool
	FilesystemAbsent   bool
	NoActiveOperations bool
}

type appInstallNameReleaseObserver func(context.Context, string, string) (appInstallNameReleaseProbe, error)
type appInstallNameReleaseApprover func(context.Context, appInstallNameReleaseRequest, string) (string, error)

var appReleaseOperator = regexp.MustCompile(`^[A-Za-z0-9._:@-]{1,128}$`)

func releaseProbeDigest(now time.Time, key, owner string, probe appInstallNameReleaseProbe) (string, error) {
	if probe.NameKey != key || probe.OwnerTaskID != owner ||
		probe.ObservedAt.IsZero() || probe.ObservedAt.After(now.Add(time.Second)) ||
		now.Sub(probe.ObservedAt) > 30*time.Second ||
		!probe.DockerAbsent || !probe.ComposeAbsent || !probe.FilesystemAbsent ||
		!probe.NoActiveOperations {
		return "", ErrAppInstallNameReleaseDenied
	}
	payload := fmt.Sprintf("gpupanel.g5.release.v1\n%s\n%s\n%t\n%t\n%t\n%t",
		key, owner, probe.DockerAbsent, probe.ComposeAbsent,
		probe.FilesystemAbsent, probe.NoActiveOperations)
	hash := sha256.Sum256([]byte(payload))
	return hex.EncodeToString(hash[:]), nil
}

// validReleaseReview protects all known non-atomic AppDB/TaskDB failure and
// uncertainty cases. A Task SUCCESS and missing AppInstall row ALONE are not
// enough: a fresh privileged Docker/Compose/filesystem observer is required.
func validReleaseReview(review AppInstallNameReview, key, owner string) bool {
	if review.NameKey != key || review.OwnerTaskID != owner ||
		review.Verified || review.CanRelease || !review.ObservationalOnly ||
		len(review.AppInstallIDs) != 0 ||
		(review.OwnerStatus != constant.StatusSuccess && review.OwnerStatus != constant.StatusFailed) {
		return false
	}
	hasMissingApp := false
	hasIndependentReview := false
	for _, reason := range review.Reasons {
		switch reason {
		case "OWNER_RESOURCE_NOT_LINKED", "OWNER_RESOURCE_NEEDS_INDEPENDENT_REVIEW":
		case "NO_APP_ROW_IS_NOT_DOCKER_OR_FILESYSTEM_PROOF":
			hasMissingApp = true
		case "INDEPENDENT_RESOURCE_REVIEW_REQUIRED":
			hasIndependentReview = true
		default:
			return false // Unknown reason/error/saturated lookup: fail closed.
		}
	}
	return hasMissingApp && hasIndependentReview
}

// releaseAppInstallNameAfterReview is deliberately an UNEXPOSED internal
// protocol. The approver and observer must be independently trusted by a
// future admin-only service; no HTTP route, command or ambient boolean grant
// is available in this PR. It never cleans Docker/Compose/filesystems.
//
// Owner-specific DELETE CAS and its append-only audit row are committed in
// ONE TaskDB transaction. Audit insertion fails closed when schema is missing.
// Old Task receipts, logs and release audit remain intact for later inspection.
func releaseAppInstallNameAfterReview(
	ctx context.Context, taskDB, appDB *gorm.DB,
	req appInstallNameReleaseRequest,
	observe appInstallNameReleaseObserver,
	approve appInstallNameReleaseApprover,
) error {
	if ctx == nil || taskDB == nil || appDB == nil || observe == nil || approve == nil {
		return ErrAppInstallNameReleaseDenied
	}
	key, err := NormalizeAppInstallNameKey(req.Name)
	if err != nil { return err }
	if req.RequestID == "" || req.OwnerTaskID == "" { return ErrAppInstallNameReleaseDenied }
	if id, err := NormalizeAppInstallTaskID(req.RequestID); err != nil || id != req.RequestID {
		return ErrAppInstallNameReleaseDenied
	}
	if id, err := NormalizeAppInstallTaskID(req.OwnerTaskID); err != nil || id != req.OwnerTaskID {
		return ErrAppInstallNameReleaseDenied
	}
	check := func() error {
		review, err := reviewAppInstallNameClaim(taskDB.WithContext(ctx), appDB.WithContext(ctx), key)
		if err != nil || !validReleaseReview(review, key, req.OwnerTaskID) {
			return ErrAppInstallNameReleaseDenied
		}
		return nil
	}
	if err := check(); err != nil { return err }
	first, err := observe(ctx, key, req.OwnerTaskID)
	if err != nil { return ErrAppInstallNameReleaseDenied }
	firstDigest, err := releaseProbeDigest(time.Now().UTC(), key, req.OwnerTaskID, first)
	if err != nil { return err }
	operator, err := approve(ctx, req, firstDigest)
	if err != nil || !appReleaseOperator.MatchString(operator) { return ErrAppInstallNameReleaseDenied }
	// Reobserve resources and both DBs AFTER approval. A stale/synthetic
	// approval alone never authorizes the later mutation.
	if err := check(); err != nil { return err }
	second, err := observe(ctx, key, req.OwnerTaskID)
	if err != nil { return ErrAppInstallNameReleaseDenied }
	evidenceDigest, err := releaseProbeDigest(time.Now().UTC(), key, req.OwnerTaskID, second)
	if err != nil || evidenceDigest != firstDigest { return ErrAppInstallNameReleaseDenied }

	return taskDB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		audit := model.AppInstallNameReleaseAudit{
			RequestID: req.RequestID, NameKey: key, OwnerTaskID: req.OwnerTaskID,
			OperatorID: operator, EvidenceSHA256: evidenceDigest, CreatedAt: time.Now().UTC(),
		}
		if err := tx.Create(&audit).Error; err != nil {
			return fmt.Errorf("persist name release audit: %w", err)
		}
		// Prevent releases when the owner changed, went UNKNOWN/Executing,
		// or lost its App TaskInstall identity between observation and CAS.
		updated := tx.Where(`name_key = ? AND task_id = ?
			AND EXISTS (SELECT 1 FROM tasks WHERE tasks.id = ?
				AND tasks.type = ? AND tasks.operate = ?
				AND tasks.status IN (?, ?))`,
			key, req.OwnerTaskID, req.OwnerTaskID,
			task.TaskScopeApp, task.TaskInstall,
			constant.StatusSuccess, constant.StatusFailed).
			Delete(&model.AppInstallNameClaim{})
		if updated.Error != nil {
			return fmt.Errorf("release name claim CAS: %w", updated.Error)
		}
		if updated.RowsAffected != 1 { return ErrAppInstallNameReleaseDenied }
		return nil
	})
}
