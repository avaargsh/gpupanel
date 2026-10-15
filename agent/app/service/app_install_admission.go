package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/1Panel-dev/1Panel/agent/app/model"
	"github.com/1Panel-dev/1Panel/agent/app/task"
	"github.com/1Panel-dev/1Panel/agent/constant"
	"github.com/1Panel-dev/1Panel/agent/global"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrAppInstallTaskReplay = errors.New("installation task ID already exists: inspect the existing task before retrying")
	ErrAppInstallTaskID     = errors.New("installation task ID must be a canonical UUID")
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

// claimAppInstallTask is the durable admission fence in the existing TaskDB.
// The primary key is authoritative across handler goroutines and agent restarts.
// Do not read-before-write: concurrent retries must lose an atomic insert.
func claimAppInstallTask(db *gorm.DB, id, name string) error {
	if db == nil {
		return errors.New("task database is unavailable")
	}
	receipt := &model.Task{
		ID: id, Name: name, Type: task.TaskScopeApp,
		Operate: task.TaskInstall, Status: constant.StatusExecuting,
		CreatedAt: time.Now().UTC(),
	}
	result := db.WithContext(context.Background()).
		Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "id"}}, DoNothing: true}).
		Create(receipt)
	if result.Error != nil {
		return fmt.Errorf("reserve installation task: %w", result.Error)
	}
	if result.RowsAffected != 1 {
		return ErrAppInstallTaskReplay
	}
	return nil
}

// ReserveAppInstallTask must run after normal API authorization/validation and
// before any application/Docker side effect. An accepted HTTP request is still
// not evidence that deployment completed.
func ReserveAppInstallTask(id, name string) error {
	if strings.TrimSpace(name) == "" {
		return errors.New("installation name is required")
	}
	if _, err := NormalizeAppInstallTaskID(id); err != nil {
		return err
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
			"status": constant.StatusFailed,
			"error_msg": "installation was not admitted; inspect installed applications for partial effects",
			"end_at": time.Now().UTC(),
		})
	return result.Error
}
