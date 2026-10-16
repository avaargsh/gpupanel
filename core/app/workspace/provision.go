package workspace

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

const (
	// This is a durable intent for a future supervised, non-root Host runner.
	// It does NOT queue or execute user code, install packages, or reserve GPUs.
	OfflinePythonProfile = "uv-python-stdlib-offline-v1"
	AwaitingHostBinding  = "AwaitingHostBinding"
	HostRunnerUnbound    = "HostRunnerUnbound"
)

var ErrPlanChanged = errors.New("workspace plan digest mismatch")

type ProvisionIntent struct {
	ID          string `gorm:"primaryKey;size:36" json:"id"`
	OwnerID     string `gorm:"not null;index" json:"-"`
	ProjectID   string `gorm:"not null;index" json:"projectId"`
	WorkspaceID string `gorm:"not null;uniqueIndex:idx_gpupanel_workspace_intent_workspace" json:"workspaceId"`
	Profile     string `gorm:"not null" json:"profile"`
	PlanDigest  string `gorm:"not null" json:"planDigest"`
	State       string `gorm:"not null" json:"state"`
	CreatedAt   int64  `gorm:"autoCreateTime:milli" json:"createdAt"`
	UpdatedAt   int64  `gorm:"autoUpdateTime:milli" json:"updatedAt"`
}

// ProvisionPlan is a metadata-only plan, not execution authorization. The
// runner is not wired; no capacity/availability check or filesystem path is
// inferred from SourceHint or the user's project name.
type ProvisionPlan struct {
	ProjectID          string           `json:"projectId"`
	WorkspaceID        string           `json:"workspaceId"`
	Profile            string           `json:"profile"`
	PlanDigest         string           `json:"planDigest"`
	WorkspaceState     string           `json:"workspaceState"`
	ExecutionAvailable bool             `json:"executionAvailable"`
	Blocker            string           `json:"blocker"`
	Intent             *ProvisionIntent `json:"intent"`
}

func canonicalID(id string) bool {
	parsed, err := uuid.Parse(id)
	return err == nil && parsed.String() == id
}

func digestForPlan(projectID, workspaceID string) string {
	sum := sha256.Sum256([]byte("GPUPanel-workspace-intent-v1\n" +
		projectID + "\n" + workspaceID + "\n" + OfflinePythonProfile + "\n"))
	return hex.EncodeToString(sum[:])
}

func (r *Registry) planInDB(ctx context.Context, db *gorm.DB, owner, projectID, workspaceID string) (ProvisionPlan, error) {
	if !validOwner(owner) {
		return ProvisionPlan{}, ErrInvalidInput
	}
	if !canonicalID(projectID) || !canonicalID(workspaceID) {
		return ProvisionPlan{}, ErrNotFound
	}
	var p Project
	if err := db.WithContext(ctx).Where("id = ? AND owner_id = ?", projectID, owner).Take(&p).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) { return ProvisionPlan{}, ErrNotFound }
		return ProvisionPlan{}, err
	}
	var ws Workspace
	if err := db.WithContext(ctx).
		Where("id = ? AND project_id = ? AND owner_id = ?", workspaceID, projectID, owner).
		Take(&ws).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) { return ProvisionPlan{}, ErrNotFound }
		return ProvisionPlan{}, err
	}
	if ws.State != NotProvisioned {
		return ProvisionPlan{}, ErrConflict
	}
	plan := ProvisionPlan{
		ProjectID: projectID, WorkspaceID: workspaceID, Profile: OfflinePythonProfile,
		PlanDigest: digestForPlan(projectID, workspaceID),
		WorkspaceState: ws.State, ExecutionAvailable: false,
		Blocker: HostRunnerUnbound,
	}
	var intent ProvisionIntent
	if err := db.WithContext(ctx).
		Where("owner_id = ? AND project_id = ? AND workspace_id = ?", owner, projectID, workspaceID).
		Take(&intent).Error; err == nil {
		plan.Intent = &intent
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return ProvisionPlan{}, err
	}
	return plan, nil
}

func (r *Registry) PreviewProvision(ctx context.Context, owner, projectID, workspaceID string) (ProvisionPlan, error) {
	if r == nil || r.db == nil { return ProvisionPlan{}, fmt.Errorf("registry database unavailable") }
	return r.planInDB(ctx, r.db, owner, projectID, workspaceID)
}

// RequestProvision records explicit approval for a bounded offline profile,
// without ever marking Workspace provisioned. A replay with the same digest
// returns the same durable intent ID, avoiding duplicate work after lost ACK.
func (r *Registry) RequestProvision(ctx context.Context, owner, projectID, workspaceID, planDigest string) (ProvisionPlan, error) {
	if r == nil || r.db == nil { return ProvisionPlan{}, fmt.Errorf("registry database unavailable") }
	if len(planDigest) != 64 || strings.ToLower(planDigest) != planDigest {
		return ProvisionPlan{}, ErrPlanChanged
	}
	var result ProvisionPlan
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		plan, err := r.planInDB(ctx, tx, owner, projectID, workspaceID)
		if err != nil { return err }
		if planDigest != plan.PlanDigest { return ErrPlanChanged }
		if plan.Intent != nil {
			if plan.Intent.PlanDigest != plan.PlanDigest || plan.Intent.Profile != OfflinePythonProfile {
				return ErrConflict
			}
			result = plan
			return nil
		}
		intent := ProvisionIntent{
			ID: uuid.NewString(), OwnerID: owner, ProjectID: projectID,
			WorkspaceID: workspaceID, Profile: OfflinePythonProfile,
			PlanDigest: plan.PlanDigest, State: AwaitingHostBinding,
		}
		if err := tx.Create(&intent).Error; err != nil {
			if errors.Is(err, gorm.ErrDuplicatedKey) ||
				strings.Contains(strings.ToLower(err.Error()), "unique constraint failed") {
				return ErrConflict
			}
			return err
		}
		plan.Intent = &intent
		result = plan
		return nil
	})
	if err != nil { return ProvisionPlan{}, err }
	return result, nil
}
