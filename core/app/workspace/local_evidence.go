package workspace

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// OperatorReported means an authenticated user submitted an observation,
// NOT that Core or the Agent independently attested to a host execution.
// Never make Workspaces Provisioned based on this table alone.
const (
	OperatorReported = "OperatorReported"
	NoObservation = "NoObservation"
	HostAttestationRequired = "IndependentHostAttestationRequired"
)

var evidenceSHA = regexp.MustCompile("^[0-9a-f]{64}$")

// LocalEvidence is immutable, content-addressed user-supplied evidence.
// It contains no arbitrary file paths, executable commands, stdout or secrets.
type LocalEvidence struct {
	ID            string `gorm:"primaryKey;size:36" json:"id"`
	OwnerID       string `gorm:"not null;index" json:"-"`
	ProjectID     string `gorm:"not null;index" json:"projectId"`
	WorkspaceID   string `gorm:"not null;index" json:"workspaceId"`
	IntentID      string `gorm:"not null;uniqueIndex:idx_gpupanel_local_evidence_intent" json:"intentId"`
	PlanDigest    string `gorm:"not null" json:"planDigest"`
	ReceiptDigest string `gorm:"not null" json:"receiptDigest"`
	EvidenceDigest string `gorm:"not null" json:"evidenceDigest"`
	TrustState    string `gorm:"not null" json:"trustState"`
	CreatedAt     int64  `gorm:"autoCreateTime:milli" json:"createdAt"`
}

type LocalEvidenceInput struct {
	IntentID       string `json:"intentId"`
	PlanDigest     string `json:"planDigest"`
	ReceiptDigest  string `json:"receiptDigest"`
	EvidenceDigest string `json:"evidenceDigest"`
}

type LocalEvidenceView struct {
	Evidence       *LocalEvidence `json:"evidence"`
	TrustState     string         `json:"trustState"`
	WorkspaceState string         `json:"workspaceState"`
	Attested       bool           `json:"attested"`
	Blocker        string         `json:"blocker"`
}

func evidenceDigest(intentID, planDigest, receiptDigest string) string {
	hash := sha256.Sum256([]byte("GPUPanel-local-evidence-v1\n" +
		intentID + "\n" + planDigest + "\n" + receiptDigest + "\n"))
	return hex.EncodeToString(hash[:])
}

func localEvidenceView(record *LocalEvidence) LocalEvidenceView {
	state := NoObservation
	if record != nil { state = OperatorReported }
	return LocalEvidenceView{
		Evidence: record, TrustState: state,
		WorkspaceState: NotProvisioned, Attested: false,
		Blocker: HostAttestationRequired,
	}
}

func (r *Registry) evidencePlan(ctx context.Context, db *gorm.DB, owner, projectID, workspaceID string) (ProvisionPlan, error) {
	plan, err := r.planInDB(ctx, db, owner, projectID, workspaceID)
	if err != nil { return ProvisionPlan{}, err }
	if plan.Intent == nil || plan.Intent.State != AwaitingHostBinding ||
		plan.Intent.PlanDigest != plan.PlanDigest || plan.Intent.Profile != OfflinePythonProfile ||
		plan.Intent.WorkspaceID != workspaceID || plan.Intent.ProjectID != projectID {
		return ProvisionPlan{}, ErrConflict
	}
	return plan, nil
}

func (r *Registry) GetLocalEvidence(ctx context.Context, owner, projectID, workspaceID string) (LocalEvidenceView, error) {
	if r == nil || r.db == nil { return LocalEvidenceView{}, fmt.Errorf("registry database unavailable") }
	plan, err := r.evidencePlan(ctx, r.db, owner, projectID, workspaceID)
	if err != nil { return LocalEvidenceView{}, err }
	var evidence LocalEvidence
	err = r.db.WithContext(ctx).Where("owner_id = ? AND intent_id = ? AND workspace_id = ?",
		owner, plan.Intent.ID, workspaceID).Take(&evidence).Error
	if errors.Is(err, gorm.ErrRecordNotFound) { return localEvidenceView(nil), nil }
	if err != nil { return LocalEvidenceView{}, err }
	return localEvidenceView(&evidence), nil
}

// ReportLocalEvidence stores an untrusted observation and deduplicates lost
// acknowledgements. A matching hash proves content consistency, not its origin.
// A separate Host+OS principal attestation is required before any state change.
func (r *Registry) ReportLocalEvidence(ctx context.Context, owner, projectID, workspaceID string, input LocalEvidenceInput) (LocalEvidenceView, error) {
	if r == nil || r.db == nil { return LocalEvidenceView{}, fmt.Errorf("registry database unavailable") }
	if !canonicalID(input.IntentID) || !evidenceSHA.MatchString(input.PlanDigest) ||
		!evidenceSHA.MatchString(input.ReceiptDigest) || !evidenceSHA.MatchString(input.EvidenceDigest) {
		return LocalEvidenceView{}, ErrInvalidInput
	}
	if input.EvidenceDigest != evidenceDigest(input.IntentID, input.PlanDigest, input.ReceiptDigest) {
		return LocalEvidenceView{}, ErrPlanChanged
	}
	var result LocalEvidenceView
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		plan, err := r.evidencePlan(ctx, tx, owner, projectID, workspaceID)
		if err != nil { return err }
		if plan.Intent.ID != input.IntentID { return ErrNotFound }
		if plan.PlanDigest != input.PlanDigest { return ErrPlanChanged }

		var existing LocalEvidence
		err = tx.WithContext(ctx).Where("owner_id = ? AND intent_id = ?", owner, input.IntentID).
			Take(&existing).Error
		if err == nil {
			if existing.EvidenceDigest != input.EvidenceDigest ||
				existing.ReceiptDigest != input.ReceiptDigest ||
				existing.WorkspaceID != workspaceID || existing.ProjectID != projectID {
				return ErrConflict
			}
			result = localEvidenceView(&existing)
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) { return err }
		row := LocalEvidence{
			ID: uuid.NewString(), OwnerID: owner, ProjectID: projectID,
			WorkspaceID: workspaceID, IntentID: input.IntentID,
			PlanDigest: input.PlanDigest, ReceiptDigest: input.ReceiptDigest,
			EvidenceDigest: input.EvidenceDigest, TrustState: OperatorReported,
		}
		if err := tx.Create(&row).Error; err != nil {
			if errors.Is(err, gorm.ErrDuplicatedKey) ||
				strings.Contains(strings.ToLower(err.Error()), "unique constraint failed") {
				return ErrConflict
			}
			return err
		}
		result = localEvidenceView(&row)
		return nil
	})
	if err != nil { return LocalEvidenceView{}, err }
	return result, nil
}
