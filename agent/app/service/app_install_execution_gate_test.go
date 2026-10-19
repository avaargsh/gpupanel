package service

import (
    "errors"
    "path/filepath"
    "sync"
    "testing"

    "github.com/avaargsh/GPUPanel/agent/app/model"
    "github.com/avaargsh/GPUPanel/agent/app/task"
    "github.com/avaargsh/GPUPanel/agent/constant"
    "github.com/glebarez/sqlite"
    "gorm.io/gorm"
    "gorm.io/gorm/logger"
)

func TestAppInstallExecutionGateSingleUseAndRestart(t *testing.T) {
    db, dbPath := appInstallAdmissionDB(t)
    id := "11111111-1111-4111-8111-111111111111"
    if err := claimAppInstallTask(db, id, "Notebook"); err != nil {
        t.Fatal(err)
    }
    if err := beginAppInstallExecution(db, id, "  NOTEBOOK "); err != nil {
        t.Fatalf("first authorized execution denied: %v", err)
    }
    var owner model.AppInstallNameClaim
    if err := db.First(&owner, "name_key = ?", "notebook").Error; err != nil { t.Fatal(err) }
    if owner.ExecutionStartedAt == nil { t.Fatal("execution CAS was not persisted") }
    if err := beginAppInstallExecution(db, id, "Notebook"); !errors.Is(err, ErrAppInstallExecutionDenied) {
        t.Fatalf("replay of already started execution must be denied: %v", err)
    }
    reopened, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{
        Logger: logger.Default.LogMode(logger.Silent),
    })
    if err != nil { t.Fatal(err) }
    handle, err := reopened.DB()
    if err != nil { t.Fatal(err) }
    defer handle.Close()
    if err := beginAppInstallExecution(reopened, id, "notebook"); !errors.Is(err, ErrAppInstallExecutionDenied) {
        t.Fatalf("reopened Agent replayed an execution: %v", err)
    }
    if err := db.Model(&model.Task{}).Where("id = ?", id).
        Update("status", constant.StatusUnknown).Error; err != nil { t.Fatal(err) }
    if err := beginAppInstallExecution(reopened, id, "notebook"); !errors.Is(err, ErrAppInstallExecutionDenied) {
        t.Fatalf("UNKNOWN Task re-executed: %v", err)
    }
}

func TestAppInstallExecutionGateConcurrentAndWrongOwner(t *testing.T) {
    db, _ := appInstallAdmissionDB(t)
    id := "22222222-2222-4222-8222-222222222222"
    if err := claimAppInstallTask(db, id, "jupyter"); err != nil { t.Fatal(err) }
    if err := beginAppInstallExecution(db, "33333333-3333-4333-8333-333333333333", "jupyter");
        !errors.Is(err, ErrAppInstallExecutionDenied) {
        t.Fatalf("different Task ID consumed another name owner: %v", err)
    }
    const workers = 20
    var wg sync.WaitGroup
    var mu sync.Mutex
    accepted, denied, failed := 0, 0, 0
    for i := 0; i < workers; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            err := beginAppInstallExecution(db, id, "JUPYTER")
            mu.Lock()
            defer mu.Unlock()
            switch {
            case err == nil: accepted++
            case errors.Is(err, ErrAppInstallExecutionDenied): denied++
            default: failed++
            }
        }()
    }
    wg.Wait()
    if accepted != 1 || denied != workers-1 || failed != 0 {
        t.Fatalf("execution CAS accepted=%d denied=%d failed=%d", accepted, denied, failed)
    }
}

func TestAppInstallExecutionGateDeniesOrphanInvalidAndAbsentSchema(t *testing.T) {
    db, _ := appInstallAdmissionDB(t)
    id := "44444444-4444-4444-8444-444444444444"
    if err := beginAppInstallExecution(db, id, "jupyter"); !errors.Is(err, ErrAppInstallExecutionDenied) {
        t.Fatalf("non-HTTP call without admission passed: %v", err)
    }
    for _, bad := range []string{"", "invalid-task-id"} {
        if err := beginAppInstallExecution(db, bad, "jupyter"); !errors.Is(err, ErrAppInstallTaskID) {
            t.Fatalf("bad task ID %q admitted: %v", bad, err)
        }
    }
    if err := claimAppInstallTask(db, id, "jupyter"); err != nil { t.Fatal(err) }
    if err := db.Model(&model.Task{}).Where("id = ?", id).
        Update("type", "Compose").Error; err != nil { t.Fatal(err) }
    if err := beginAppInstallExecution(db, id, "jupyter"); !errors.Is(err, ErrAppInstallExecutionDenied) {
        t.Fatalf("wrong-scope task executed: %v", err)
    }
    if err := db.Model(&model.Task{}).Where("id = ?", id).
        Updates(map[string]interface{}{"type": task.TaskScopeApp, "status": constant.StatusFailed}).Error;
        err != nil { t.Fatal(err) }
    if err := beginAppInstallExecution(db, id, "jupyter"); !errors.Is(err, ErrAppInstallExecutionDenied) {
        t.Fatalf("failed task executed: %v", err)
    }

    old, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "unmigrated.db")), &gorm.Config{
        Logger: logger.Default.LogMode(logger.Silent),
    })
    if err != nil { t.Fatal(err) }
    sqlDB, err := old.DB()
    if err != nil { t.Fatal(err) }
    defer sqlDB.Close()
    if err := old.AutoMigrate(&model.Task{}); err != nil { t.Fatal(err) }
    if err := beginAppInstallExecution(old, id, "jupyter"); err == nil {
        t.Fatal("unmigrated Agent TaskDB executed a request")
    }
}
