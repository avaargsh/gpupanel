package lifecycle

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"syscall"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"gorm.io/gorm/logger"
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
func Open(dbPath string) (*Store, error) {
	abs, err := filepath.Abs(dbPath)
	if err != nil || dbPath == "" || strings.ContainsRune(abs, 0) {
		return nil, fmt.Errorf("%w: database path must be absolute", ErrInvalidRequest)
	}
	if filepath.Clean(abs) != abs || strings.Contains(abs, "?") {
		return nil, fmt.Errorf("%w: database path must be normalized and contain no query marker", ErrInvalidRequest)
	}
	dir := filepath.Dir(abs)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, fmt.Errorf("lifecycle: create journal directory: %w", err)
	}
	dirInfo, err := os.Lstat(dir)
	if err != nil || !dirInfo.IsDir() || dirInfo.Mode()&os.ModeSymlink != 0 {
		return nil, fmt.Errorf("lifecycle: journal directory is redirected or invalid")
	}
	if dirInfo.Mode().Perm()&0077 != 0 {
		return nil, fmt.Errorf("lifecycle: journal directory permissions must exclude group/other access")
	}
	if err := checkOwner(dirInfo, os.Geteuid()); err != nil {
		return nil, err
	}
	if err := ensurePrivateDBFile(abs); err != nil {
		return nil, err
	}

	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(10000)&_pragma=foreign_keys(1)", filepath.ToSlash(abs))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		return nil, fmt.Errorf("lifecycle: open SQLite journal: %w", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("lifecycle: access SQLite connection: %w", err)
	}
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	if err := sqlDB.Ping(); err != nil {
		_ = sqlDB.Close()
		return nil, fmt.Errorf("lifecycle: ping SQLite journal: %w", err)
	}
	if err := db.Exec("PRAGMA synchronous=FULL").Error; err != nil {
		_ = sqlDB.Close()
		return nil, fmt.Errorf("lifecycle: configure SQLite durability: %w", err)
	}
	if err := db.AutoMigrate(&operationRow{}, &eventRow{}); err != nil {
		_ = sqlDB.Close()
		return nil, fmt.Errorf("lifecycle: migrate SQLite journal: %w", err)
	}
	if err := os.Chmod(abs, 0600); err != nil {
		_ = sqlDB.Close()
		return nil, fmt.Errorf("lifecycle: secure SQLite journal: %w", err)
	}
	fileInfo, err := os.Lstat(abs)
	if err != nil || !fileInfo.Mode().IsRegular() || fileInfo.Mode()&os.ModeSymlink != 0 {
		_ = sqlDB.Close()
		return nil, fmt.Errorf("lifecycle: journal file changed type")
	}
	if err := checkOwner(fileInfo, os.Geteuid()); err != nil {
		_ = sqlDB.Close()
		return nil, err
	}
	return &Store{db: db, sqlDB: sqlDB}, nil
}

func OpenDefault() (*Store, error) {
	if os.Geteuid() != 0 {
		return nil, fmt.Errorf("lifecycle: opening the host journal requires root")
	}
	return Open(DefaultDatabase)
}

func (s *Store) Close() error {
	if s == nil || s.sqlDB == nil {
		return nil
	}
	return s.sqlDB.Close()
}

func (s *Store) Claim(ctx context.Context, req ClaimRequest) (Operation, bool, error) {
	if s == nil || s.db == nil {
		return Operation{}, false, fmt.Errorf("%w: store is not open", ErrInvalidRequest)
	}
	if err := validateClaim(req); err != nil {
		return Operation{}, false, err
	}
	if err := ctx.Err(); err != nil {
		return Operation{}, false, err
	}
	sum := sha256.Sum256(req.Binding)
	bindingDigest := hex.EncodeToString(sum[:])
	now := time.Now().UTC().UnixNano()
	id, err := newOperationID()
	if err != nil {
		return Operation{}, false, err
	}
	candidate := operationRow{
		ID: id, Owner: req.Owner, Target: req.Target, Kind: string(req.Kind),
		IdempotencyKey: req.IdempotencyKey, BindingSHA256: bindingDigest,
		ArtifactSHA256: req.ArtifactSHA256, State: string(StatePlanned), Revision: 1,
		CreatedAtNS: now, UpdatedAtNS: now,
	}

	var result Operation
	created := false
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		insert := tx.Clauses(clause.OnConflict{
			Columns: []clause.Column{
				{Name: "owner"}, {Name: "target"}, {Name: "kind"}, {Name: "idempotency_key"},
			},
			DoNothing: true,
		}).Create(&candidate)
		if insert.Error != nil {
			return fmt.Errorf("lifecycle: persist claim: %w", insert.Error)
		}
		if insert.RowsAffected == 1 {
			event := eventRow{
				OperationID: candidate.ID, Sequence: 1, Owner: candidate.Owner,
				FromState: "", ToState: string(StatePlanned), Actor: candidate.Owner,
				OccurredAtNS: now,
			}
			if err := tx.Create(&event).Error; err != nil {
				return fmt.Errorf("lifecycle: persist claim event: %w", err)
			}
			result = rowToOperation(candidate)
			created = true
			return nil
		}

		var existing operationRow
		if err := tx.Where("owner = ? AND target = ? AND kind = ? AND idempotency_key = ?",
			req.Owner, req.Target, string(req.Kind), req.IdempotencyKey).First(&existing).Error; err != nil {
			return fmt.Errorf("lifecycle: load idempotent claim: %w", err)
		}
		if existing.BindingSHA256 != bindingDigest || existing.ArtifactSHA256 != req.ArtifactSHA256 {
			return fmt.Errorf("%w: key already binds a different parameter or artifact digest", ErrBindingMismatch)
		}
		result = rowToOperation(existing)
		return nil
	})
	return result, created, err
}

func (s *Store) Advance(ctx context.Context, req TransitionRequest) (Operation, bool, error) {
	return s.advance(ctx, req, false)
}

func (s *Store) advance(ctx context.Context, req TransitionRequest, allowReconcile bool) (Operation, bool, error) {
	if s == nil || s.db == nil {
		return Operation{}, false, fmt.Errorf("%w: store is not open", ErrInvalidRequest)
	}
	if err := validateTransitionRequest(req); err != nil {
		return Operation{}, false, err
	}
	if err := ctx.Err(); err != nil {
		return Operation{}, false, err
	}
	var result Operation
	replayed := false
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var current operationRow
		if err := tx.Where("id = ? AND owner = ?", req.OperationID, req.Owner).First(&current).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound
			}
			return fmt.Errorf("lifecycle: load operation: %w", err)
		}
		if current.Revision == req.ExpectedRevision+1 && State(current.State) == req.NextState {
			var previous eventRow
			if err := tx.Where("operation_id = ? AND sequence = ?", current.ID, current.Revision).First(&previous).Error; err == nil &&
				previous.FromState == string(req.ExpectedState) && previous.ToState == string(req.NextState) &&
				previous.Actor == req.Actor && previous.Stage == req.Stage && previous.ErrorCode == req.ErrorCode &&
				previous.EvidenceSHA256 == req.EvidenceSHA256 {
				result = rowToOperation(current)
				replayed = true
				return nil
			}
		}
		if current.Revision != req.ExpectedRevision || State(current.State) != req.ExpectedState {
			return fmt.Errorf("%w: expected %s/revision %d; found %s/revision %d",
				ErrRevisionConflict, req.ExpectedState, req.ExpectedRevision, current.State, current.Revision)
		}
		if !transitionAllowed(req.ExpectedState, req.NextState) && !(allowReconcile && reconciliationTransitionAllowed(req.ExpectedState, req.NextState)) {
			return fmt.Errorf("%w: %s -> %s", ErrInvalidTransition, req.ExpectedState, req.NextState)
		}
		now := time.Now().UTC().UnixNano()
		nextRevision := current.Revision + 1
		update := tx.Model(&operationRow{}).
			Where("id = ? AND owner = ? AND state = ? AND revision = ?",
				current.ID, req.Owner, string(req.ExpectedState), req.ExpectedRevision).
			Updates(map[string]interface{}{
				"state": string(req.NextState), "revision": nextRevision,
				"stage": req.Stage, "error_code": req.ErrorCode,
				"evidence_sha256": req.EvidenceSHA256, "updated_at_ns": now,
			})
		if update.Error != nil {
			return fmt.Errorf("lifecycle: update operation: %w", update.Error)
		}
		if update.RowsAffected != 1 {
			return ErrRevisionConflict
		}
		event := eventRow{
			OperationID: current.ID, Sequence: nextRevision, Owner: req.Owner,
			FromState: string(req.ExpectedState), ToState: string(req.NextState),
			Actor: req.Actor, Stage: req.Stage, ErrorCode: req.ErrorCode,
			EvidenceSHA256: req.EvidenceSHA256, OccurredAtNS: now,
		}
		if err := tx.Create(&event).Error; err != nil {
			return fmt.Errorf("lifecycle: append transition event: %w", err)
		}
		current.State = string(req.NextState)
		current.Revision = nextRevision
		current.Stage = req.Stage
		current.ErrorCode = req.ErrorCode
		current.EvidenceSHA256 = req.EvidenceSHA256
		current.UpdatedAtNS = now
		result = rowToOperation(current)
		return nil
	})
	return result, replayed, err
}

// Reconcile changes an unknown/recovery_required outcome only when the caller
// supplies an independent evidence digest. There is no automatic transition
// out of these states during Claim, Get or process startup.
func (s *Store) Reconcile(ctx context.Context, req ReconcileRequest) (Operation, error) {
	if req.ExpectedState != StateUnknown && req.ExpectedState != StateRecoveryRequired {
		return Operation{}, fmt.Errorf("%w: reconciliation requires unknown or recovery_required", ErrInvalidTransition)
	}
	if req.NextState != StateCompleted && req.NextState != StateRolledBack && req.NextState != StateRecoveryRequired {
		return Operation{}, fmt.Errorf("%w: unsupported reconciliation result %s", ErrInvalidTransition, req.NextState)
	}
	if req.EvidenceSHA256 == "" || !digestPattern.MatchString(req.EvidenceSHA256) {
		return Operation{}, fmt.Errorf("%w: independent evidence digest required", ErrInvalidRequest)
	}
	if req.Actor == "" || len(req.Actor) > maxActorBytes {
		return Operation{}, fmt.Errorf("%w: reconciler identity required", ErrInvalidRequest)
	}
	errorCode := req.ErrorCode
	if req.NextState == StateRecoveryRequired && errorCode == "" {
		return Operation{}, fmt.Errorf("%w: recovery error code required", ErrInvalidRequest)
	}
	out, _, err := s.advance(ctx, TransitionRequest{
		Owner: req.Owner, OperationID: req.OperationID,
		ExpectedState: req.ExpectedState, ExpectedRevision: req.ExpectedRevision,
		NextState: req.NextState, Actor: req.Actor, ErrorCode: errorCode,
		EvidenceSHA256: req.EvidenceSHA256,
	}, true)
	return out, err
}

func (s *Store) Get(ctx context.Context, owner, id string) (Operation, error) {
	if s == nil || s.db == nil {
		return Operation{}, fmt.Errorf("%w: store is not open", ErrInvalidRequest)
	}
	if err := validateOwner(owner); err != nil { return Operation{}, err }
	if id == "" || len(id) > 36 { return Operation{}, fmt.Errorf("%w: invalid operation ID", ErrInvalidRequest) }
	if err := ctx.Err(); err != nil { return Operation{}, err }
	var rec operationRow
	if err := s.db.WithContext(ctx).Where("id = ? AND owner = ?", id, owner).First(&rec).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) { return Operation{}, ErrNotFound }
		return Operation{}, fmt.Errorf("lifecycle: read operation: %w", err)
	}
	return rowToOperation(rec), nil
}

func (s *Store) History(ctx context.Context, owner, id string) ([]Event, error) {
	if _, err := s.Get(ctx, owner, id); err != nil { return nil, err }
	var rows []eventRow
	if err := s.db.WithContext(ctx).Where("operation_id = ? AND owner = ?", id, owner).Order("sequence ASC").Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("lifecycle: read operation history: %w", err)
	}
	out := make([]Event, 0, len(rows))
	for _, row := range rows {
		out = append(out, Event{
			ID: row.ID, OperationID: row.OperationID, Sequence: row.Sequence,
			Owner: row.Owner, FromState: State(row.FromState), ToState: State(row.ToState),
			Actor: row.Actor, Stage: row.Stage, ErrorCode: row.ErrorCode,
			EvidenceSHA256: row.EvidenceSHA256, OccurredAt: time.Unix(0, row.OccurredAtNS).UTC(),
		})
	}
	return out, nil
}

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
		return to == StateBackupSealed || to == StateApplying || to == StateFailedNoMutation
	case StateBackupSealed:
		return to == StateApplying || to == StateFailedNoMutation
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
		if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("lifecycle: database file must be a regular non-symlink file")
		}
		if info.Mode().Perm()&0077 != 0 {
			return fmt.Errorf("lifecycle: database file permissions must exclude group/other access")
		}
		return checkOwner(info, os.Geteuid())
	}
	if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("lifecycle: inspect database path: %w", err)
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_RDWR, 0600)
	if err != nil {
		if errors.Is(err, os.ErrExist) { return ensurePrivateDBFile(path) }
		return fmt.Errorf("lifecycle: create private database file: %w", err)
	}
	if err := file.Close(); err != nil { return err }
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
