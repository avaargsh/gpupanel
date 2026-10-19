package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/avaargsh/GPUPanel/agent/app/model"
	"github.com/avaargsh/GPUPanel/agent/app/task"
	"github.com/avaargsh/GPUPanel/agent/constant"
	"github.com/avaargsh/GPUPanel/agent/global"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrAppInstallTaskReplay = errors.New("installation task ID already exists: inspect the existing task before retrying")
	ErrAppInstallTaskID     = errors.New("installation task ID must be a canonical UUID")
	ErrAppInstallNameReserved = errors.New("installation name has a durable unresolved admission: inspect original task and resources")
	ErrAppInstallNameInvalid = errors.New("installation name must be nonempty and at most 255 bytes")
)

// NormalizeAppInstallTaskID preserves the optional legacy API field while
// rejecting path-like identifiers before Task.NewTask uses the ID as a log name.
func NormalizeAppInstallTaskID(id string) (string, error) {
	if id == "" {
		return uuid.NewString(), nil
	}
	parsed, err := uuid.Parse(id)
	if err != nil || parsed.String() != id {
		return "", ErrAppInstallTaskID
	}
	return id, nil
}

// NormalizeAppInstallNameKey applies the same trim/case-insensitive name domain
// as the existing preparation lock. The durable claim is keyed by the name,
// not the request ID, and deliberately has no time-based eviction.
func NormalizeAppInstallNameKey(name string) (string, error) {
	key := strings.ToLower(strings.TrimSpace(name))
	if key == "" || len(key) > 255 {
		return "", ErrAppInstallNameInvalid
	}
	return key, nil
}

// claimAppInstallTask creates the Task ID and normalized name owner atomically.
// Separate Agent processes compete on TaskDB's durable unique keys, not the
// process-local preparation mutex. A failed claim rolls back both inserts.
// The claim remains occupied on SUCCESS, FAILED and UNKNOWN: no automatic
// retry, timeout, restart, or task lifecycle transition releases ownership.
func claimAppInstallTask(db *gorm.DB, id, name string) error {
	if db == nil {
		return errors.New("task database is unavailable")
	}
	key, err := NormalizeAppInstallNameKey(name)
	if err != nil {
		return err
	}
	// HTTP callers must normalize/generate their UUID before admission. A
	// missing ID must not reserve a blank TaskDB key or generate an ID that
	// is different from the one later used by the task executor.
	if id == "" {
		return ErrAppInstallTaskID
	}
	if normalized, err := NormalizeAppInstallTaskID(id); err != nil || normalized != id {
		return ErrAppInstallTaskID
	}
	return db.WithContext(context.Background()).Transaction(func(tx *gorm.DB) error {
		receipt := &model.Task{
			ID: id, Name: name, Type: task.TaskScopeApp,
			Operate: task.TaskInstall, Status: constant.StatusExecuting,
			CreatedAt: time.Now().UTC(),
		}
		result := tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "id"}}, DoNothing: true}).Create(receipt)
		if result.Error != nil {
			return fmt.Errorf("reserve installation task: %w", result.Error)
		}
		if result.RowsAffected != 1 {
			return ErrAppInstallTaskReplay
		}
		nameOwner := &model.AppInstallNameClaim{NameKey: key, TaskID: id, CreatedAt: time.Now().UTC()}
		claimed := tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "name_key"}}, DoNothing: true}).Create(nameOwner)
		if claimed.Error != nil {
			return fmt.Errorf("reserve installation name: %w", claimed.Error)
		}
		if claimed.RowsAffected != 1 {
			return ErrAppInstallNameReserved
		}
		return nil
	})
}

// ReserveAppInstallTask must run after normal API authorization/validation and
// before any application/Docker side effect. An accepted HTTP request is still
// not evidence that deployment completed.
func ReserveAppInstallTask(id, name string) error {
	if _, err := NormalizeAppInstallNameKey(name); err != nil {
		return err
	}
	// HTTP callers must normalize/generate their UUID before admission. A
	// missing ID must not reserve a blank TaskDB key or generate an ID that
	// is different from the one later used by the task executor.
	if id == "" {
		return ErrAppInstallTaskID
	}
	if normalized, err := NormalizeAppInstallTaskID(id); err != nil || normalized != id {
		return ErrAppInstallTaskID
	}
	return claimAppInstallTask(global.TaskDB, id, name)
}

// MarkAppInstallAdmissionFailed leaves a durable, inspectable receipt rather
// than releasing the ID after a potentially partially executed request.
// Only a pre-execution receipt (resource_id=0) may be marked failed here.
func MarkAppInstallAdmissionFailed(id string) error {
	return markAppInstallAdmissionFailed(global.TaskDB, id)
}

func markAppInstallAdmissionFailed(db *gorm.DB, id string) error {
	if db == nil {
		return errors.New("task database is unavailable")
	}
	result := db.Model(&model.Task{}).
		Where("id = ? AND type = ? AND operate = ? AND status = ? AND resource_id = 0",
			id, task.TaskScopeApp, task.TaskInstall, constant.StatusExecuting).
		Updates(map[string]interface{}{
			"status":    constant.StatusFailed,
			"error_msg": "installation was not admitted; inspect installed applications for partial effects",
			"end_at":    time.Now().UTC(),
		})
	return result.Error
}
