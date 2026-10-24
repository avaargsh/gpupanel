package lifecycle

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"gorm.io/gorm/logger"
)

func Open(dbPath string) (*Store, error) {
	if dbPath == "" || !filepath.IsAbs(dbPath) || filepath.Clean(dbPath) != dbPath || strings.ContainsRune(dbPath, 0) {
		return nil, fmt.Errorf("%w: database path must be normalized and absolute", ErrInvalidRequest)
	}
	if strings.Contains(dbPath, "?") {
		return nil, fmt.Errorf("%w: database path must not contain a SQLite query marker", ErrInvalidRequest)
	}
	abs := dbPath
	dir := filepath.Dir(abs)
	if err := checkDirectoryAncestors(dir, os.Geteuid()); err != nil {
		return nil, err
	}
	if _, err := os.Lstat(dir); errors.Is(err, os.ErrNotExist) {
		// Create only the leaf directory after its parent chain has been checked;
		// never let MkdirAll silently walk through an untrusted symlink ancestor.
		if err := os.Mkdir(dir, 0700); err != nil && !errors.Is(err, os.ErrExist) {
			return nil, fmt.Errorf("lifecycle: create journal directory: %w", err)
		}
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
		if existing.BindingSHA256 != bindingDigest || (req.ArtifactSHA256 != "" && existing.ArtifactSHA256 != req.ArtifactSHA256) {
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
		if req.ArtifactSHA256 != "" && current.ArtifactSHA256 != "" && current.ArtifactSHA256 != req.ArtifactSHA256 {
			return fmt.Errorf("%w: operation is already bound to a different artifact digest", ErrBindingMismatch)
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
		artifactDigest := current.ArtifactSHA256
		if req.ArtifactSHA256 != "" {
			artifactDigest = req.ArtifactSHA256
		}
		update := tx.Model(&operationRow{}).
			Where("id = ? AND owner = ? AND state = ? AND revision = ?",
				current.ID, req.Owner, string(req.ExpectedState), req.ExpectedRevision).
			Updates(map[string]interface{}{
				"state": string(req.NextState), "revision": nextRevision,
				"stage": req.Stage, "error_code": req.ErrorCode,
				"evidence_sha256": req.EvidenceSHA256, "artifact_sha256": artifactDigest, "updated_at_ns": now,
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
		current.ArtifactSHA256 = artifactDigest
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
