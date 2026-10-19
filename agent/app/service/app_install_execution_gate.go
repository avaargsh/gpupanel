package service

import (
    "errors"
    "fmt"
    "time"

    "github.com/avaargsh/GPUPanel/agent/app/model"
    "github.com/avaargsh/GPUPanel/agent/app/task"
    "github.com/avaargsh/GPUPanel/agent/constant"
    "github.com/avaargsh/GPUPanel/agent/global"
    "gorm.io/gorm"
)

var ErrAppInstallExecutionDenied = errors.New(
    "installation execution is not authorized or was already attempted: inspect the original durable admission",
)

// beginAppInstallExecution is the single-use boundary shared by HTTP and
// internal Install callers. It cannot create admission or release ownership.
// A successful CAS is sticky even if the Agent crashes before touching Docker:
// this intentionally leaves UNKNOWN evidence for manual reconciliation.
//
// An existence predicate binds the claim to a currently executing App
// TaskInstall row. It is evaluated with the UPDATE itself to prevent an
// intervening TaskDB status change from being ignored.
func beginAppInstallExecution(db *gorm.DB, id, name string) error {
    if db == nil {
        return errors.New("task database is unavailable")
    }
    key, err := NormalizeAppInstallNameKey(name)
    if err != nil {
        return err
    }
    if id == "" {
        return ErrAppInstallTaskID
    }
    canonical, err := NormalizeAppInstallTaskID(id)
    if err != nil || canonical != id {
        return ErrAppInstallTaskID
    }
    startedAt := time.Now().UTC()
    result := db.Model(&model.AppInstallNameClaim{}).
        Where(`name_key = ? AND task_id = ? AND execution_started_at IS NULL
            AND EXISTS (SELECT 1 FROM tasks WHERE tasks.id = ?
                AND tasks.type = ? AND tasks.operate = ? AND tasks.status = ?)`,
            key, id, id, task.TaskScopeApp, task.TaskInstall, constant.StatusExecuting).
        Update("execution_started_at", startedAt)
    if result.Error != nil {
        return fmt.Errorf("check durable installation execution fence: %w", result.Error)
    }
    if result.RowsAffected != 1 {
        return ErrAppInstallExecutionDenied
    }
    return nil
}

// BeginAppInstallExecution is invoked exclusively by the shared Install
// implementation, after normal API authorization if applicable. The name
// owner must already exist, with its matching canonical Task ID.
func BeginAppInstallExecution(id, name string) error {
    return beginAppInstallExecution(global.TaskDB, id, name)
}
