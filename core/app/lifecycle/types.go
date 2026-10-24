package lifecycle

import (
	"errors"
	"regexp"
	"time"

	"gorm.io/gorm"
)

const (
	DefaultJournalDir = "/var/lib/gpupanel-lifecycle"
	DefaultDatabase   = "/var/lib/gpupanel-lifecycle/operations.db"

	maxOwnerBytes = 128
	maxTargetBytes = 512
	maxKeyBytes = 128
	maxBindingBytes = 64 << 10
	maxActorBytes = 128
	maxStageBytes = 128
	maxErrorCodeBytes = 128
)

var (
	ErrInvalidRequest = errors.New("lifecycle: invalid request")
	ErrBindingMismatch = errors.New("lifecycle: idempotency key reused with a different binding")
	ErrNotFound = errors.New("lifecycle: operation not found")
	ErrOwnershipDenied = errors.New("lifecycle: operation ownership denied")
	ErrRevisionConflict = errors.New("lifecycle: operation revision conflict")
	ErrInvalidTransition = errors.New("lifecycle: invalid state transition")
)

var idempotencyKeyPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)
var digestPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

// Kind is the system-level operation boundary. AppInstall/Compose task records
// remain a separate lifecycle and cannot be used as system-package evidence.
type Kind string

const (
	KindInstall   Kind = "install"
	KindUpgrade   Kind = "upgrade"
	KindUninstall Kind = "uninstall"
	KindRollback  Kind = "rollback"
	KindBackup    Kind = "backup"
	KindRestore   Kind = "restore"
)

func (k Kind) Valid() bool {
	switch k {
	case KindInstall, KindUpgrade, KindUninstall, KindRollback, KindBackup, KindRestore:
		return true
	default:
		return false
	}
}

// State is a durable system-lifecycle state. Unknown is not a retry permission.
type State string

const (
	StatePlanned          State = "planned"
	StatePreflight        State = "preflight"
	StatePlanReviewed     State = "plan_reviewed"
	StateBackupSealed     State = "backup_sealed"
	StateApplying         State = "applying"
	StateVerifying        State = "verifying"
	StateCompleted        State = "completed"
	StateFailedNoMutation State = "failed_no_mutation"
	StateRolledBack       State = "rolled_back"
	StateUnknown          State = "unknown"
	StateRecoveryRequired State = "recovery_required"
)

func (s State) Valid() bool {
	switch s {
	case StatePlanned, StatePreflight, StatePlanReviewed, StateBackupSealed,
		StateApplying, StateVerifying, StateCompleted, StateFailedNoMutation,
		StateRolledBack, StateUnknown, StateRecoveryRequired:
		return true
	default:
		return false
	}
}

func (s State) Terminal() bool {
	switch s {
	case StateCompleted, StateFailedNoMutation, StateRolledBack, StateUnknown, StateRecoveryRequired:
		return true
	default:
		return false
	}
}

// ClaimRequest must be built at a trusted boundary. Owner must come from a
// verified session/API principal or the trusted host supervisor; never copy it
// from an arbitrary request field. Binding is canonical, bounded, and contains
// no secrets. ArtifactSHA256 identifies the immutable candidate when available.
type ClaimRequest struct {
	Owner         string
	Target        string
	Kind          Kind
	IdempotencyKey string
	Binding       []byte
	ArtifactSHA256 string
}

// Operation is an immutable returned snapshot. A Claim replay returns the
// same operation with created=false; callers must not execute on replay.
// In particular, an existing applying/verifying/unknown/recovery_required
// operation requires observation/reconciliation, never blind replay.
type Operation struct {
	ID              string    `json:"id"`
	Owner           string    `json:"owner"`
	Target          string    `json:"target"`
	Kind            Kind      `json:"kind"`
	IdempotencyKey  string    `json:"idempotencyKey"`
	BindingSHA256   string    `json:"bindingSha256"`
	ArtifactSHA256  string    `json:"artifactSha256"`
	State           State     `json:"state"`
	Revision        uint64    `json:"revision"`
	Stage           string    `json:"stage"`
	ErrorCode       string    `json:"errorCode,omitempty"`
	EvidenceSHA256  string    `json:"evidenceSha256,omitempty"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

// Event is append-only evidence of a state transition. It stores no raw
// parameters, credentials, logs, or backup payloads.
type Event struct {
	ID             uint64    `json:"id"`
	OperationID    string    `json:"operationId"`
	Sequence       uint64    `json:"sequence"`
	Owner          string    `json:"owner"`
	FromState      State     `json:"fromState"`
	ToState        State     `json:"toState"`
	Actor          string    `json:"actor"`
	Stage          string    `json:"stage"`
	ErrorCode      string    `json:"errorCode,omitempty"`
	EvidenceSHA256 string    `json:"evidenceSha256,omitempty"`
	OccurredAt     time.Time `json:"occurredAt"`
}

type TransitionRequest struct {
	Owner            string
	OperationID      string
	ExpectedState    State
	ExpectedRevision uint64
	NextState        State
	Actor            string
	Stage            string
	ErrorCode        string
	EvidenceSHA256   string
	ArtifactSHA256   string
}

// ReconcileRequest is the only path out of unknown/recovery_required. It
// requires an independently generated evidence digest and cannot be called
// implicitly by Claim, Get, or a retry.
type ReconcileRequest struct {
	Owner          string
	OperationID    string
	ExpectedState  State
	ExpectedRevision uint64
	NextState      State
	Actor          string
	ErrorCode      string
	EvidenceSHA256 string
}

// operationRow is the cross-language SQLite schema. Python host scripts use
// the same names and integer nanosecond timestamps.
type operationRow struct {
	ID               string `gorm:"column:id;primaryKey;size:36"`
	Owner            string `gorm:"column:owner;not null;size:128;uniqueIndex:idx_lifecycle_operation_identity,priority:1"`
	Target           string `gorm:"column:target;not null;size:512;uniqueIndex:idx_lifecycle_operation_identity,priority:2"`
	Kind             string `gorm:"column:kind;not null;size:32;uniqueIndex:idx_lifecycle_operation_identity,priority:3"`
	IdempotencyKey   string `gorm:"column:idempotency_key;not null;size:128;uniqueIndex:idx_lifecycle_operation_identity,priority:4"`
	BindingSHA256    string `gorm:"column:binding_sha256;not null;size:64"`
	ArtifactSHA256   string `gorm:"column:artifact_sha256;not null;size:64;default:''"`
	State            string `gorm:"column:state;not null;size:32;index:idx_lifecycle_operation_state"`
	Revision         uint64 `gorm:"column:revision;not null"`
	Stage            string `gorm:"column:stage;not null;size:128;default:''"`
	ErrorCode        string `gorm:"column:error_code;not null;size:128;default:''"`
	EvidenceSHA256   string `gorm:"column:evidence_sha256;not null;size:64;default:''"`
	CreatedAtNS      int64  `gorm:"column:created_at_ns;not null"`
	UpdatedAtNS      int64  `gorm:"column:updated_at_ns;not null"`
}

func (operationRow) TableName() string { return "lifecycle_operations" }

type eventRow struct {
	ID             uint64 `gorm:"column:id;primaryKey;autoIncrement"`
	OperationID    string `gorm:"column:operation_id;not null;size:36;index:idx_lifecycle_event_operation;uniqueIndex:idx_lifecycle_event_sequence,priority:1"`
	Sequence       uint64 `gorm:"column:sequence;not null;uniqueIndex:idx_lifecycle_event_sequence,priority:2"`
	Owner          string `gorm:"column:owner;not null;size:128"`
	FromState      string `gorm:"column:from_state;not null;size:32"`
	ToState        string `gorm:"column:to_state;not null;size:32"`
	Actor          string `gorm:"column:actor;not null;size:128;default:''"`
	Stage          string `gorm:"column:stage;not null;size:128;default:''"`
	ErrorCode      string `gorm:"column:error_code;not null;size:128;default:''"`
	EvidenceSHA256 string `gorm:"column:evidence_sha256;not null;size:64;default:''"`
	OccurredAtNS   int64  `gorm:"column:occurred_at_ns;not null"`
}

func (eventRow) TableName() string { return "lifecycle_operation_events" }

// Store persists operation identity and state in a host-level database that
// survives product upgrades, database restores and product-data purge.
type Store struct {
	db *gorm.DB
	sqlDB interface{ Close() error }
}

// Open opens a durable SQLite journal at an absolute path. It refuses symlinked
// files/directories, non-private directories and files owned by another UID.
// Production callers should use OpenDefault; explicit paths support isolated
// integration tests.