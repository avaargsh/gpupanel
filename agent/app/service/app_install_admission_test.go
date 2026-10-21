package service

import (
	"errors"
	"fmt"
	"strings"
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

func appInstallAdmissionDB(t *testing.T) (*gorm.DB, string) {
	t.Helper()
	p := filepath.Join(t.TempDir(), "tasks.db")
	db, err := gorm.Open(sqlite.Open(p), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.Task{}, &model.AppInstallNameClaim{}); err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	return db, p
}

func TestAppInstallTaskAdmissionCanonicalID(t *testing.T) {
	if id, err := NormalizeAppInstallTaskID(""); err != nil || len(id) != 36 {
		t.Fatalf("legacy empty identifier cannot generate UUID: %s, %v", id, err)
	}
	for _, bad := range []string{
		"../invalid", "../../other.log", "/tmp/receipt", "not-a-uuid",
		"99999999999999999999999999999999",
		"AAAAAAAA-AAAA-4AAA-AAAA-AAAAAAAAAAAA",
	} {
		if _, err := NormalizeAppInstallTaskID(bad); !errors.Is(err, ErrAppInstallTaskID) {
			t.Errorf("bad task ID %q accepted: %v", bad, err)
		}
	}
	if got, err := NormalizeAppInstallTaskID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"); err != nil || got != "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" {
		t.Fatalf("valid id rejected: %s %v", got, err)
	}
}

func TestAppInstallTaskAdmissionConcurrentSameID(t *testing.T) {
	db, _ := appInstallAdmissionDB(t)
	id := "11111111-1111-4111-8111-111111111111"
	const workers = 24
	var wg sync.WaitGroup
	var accepted, replay, unexpected int
	var lock sync.Mutex
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			err := claimAppInstallTask(db, id, "dev-service")
			lock.Lock()
			defer lock.Unlock()
			switch {
			case err == nil:
				accepted++
			case errors.Is(err, ErrAppInstallTaskReplay):
				replay++
			default:
				unexpected++
			}
		}()
	}
	wg.Wait()
	if accepted != 1 || replay != workers-1 || unexpected != 0 {
		t.Fatalf("accepted=%d replay=%d unexpected=%d", accepted, replay, unexpected)
	}
	var receipt model.Task
	if err := db.First(&receipt, "id = ?", id).Error; err != nil {
		t.Fatal(err)
	}
	if receipt.Type != task.TaskScopeApp || receipt.Operate != task.TaskInstall ||
		receipt.Status != constant.StatusExecuting || receipt.ResourceID != 0 {
		t.Fatalf("invalid receipt type=%s operate=%s status=%s resource=%d",
			receipt.Type, receipt.Operate, receipt.Status, receipt.ResourceID)
	}
}

func TestAppInstallTaskAdmissionSurvivesReopen(t *testing.T) {
	db, path := appInstallAdmissionDB(t)
	id := "22222222-2222-4222-8222-222222222222"
	if err := claimAppInstallTask(db, id, "local-starter"); err != nil {
		t.Fatal(err)
	}
	other, err := gorm.Open(sqlite.Open(path), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	otherSQL, err := other.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer otherSQL.Close()
	if err := claimAppInstallTask(other, id, "different-request"); !errors.Is(err, ErrAppInstallTaskReplay) {
		t.Fatalf("after reopen same ID must remain occupied: %v", err)
	}
	var receipt model.Task
	if err := other.First(&receipt, "id = ?", id).Error; err != nil {
		t.Fatal(err)
	}
	if receipt.Name != "local-starter" {
		t.Fatalf("replay overwrote original receipt: %s", receipt.Name)
	}
}

func TestAppInstallTaskAdmissionFailureCannotReleaseOrClobberRunning(t *testing.T) {
	db, _ := appInstallAdmissionDB(t)
	id := "33333333-3333-4333-8333-333333333333"
	if err := claimAppInstallTask(db, id, "local-starter"); err != nil {
		t.Fatal(err)
	}
	if err := markAppInstallAdmissionFailed(db, id); err != nil {
		t.Fatal(err)
	}
	var receipt model.Task
	if err := db.First(&receipt, "id = ?", id).Error; err != nil {
		t.Fatal(err)
	}
	if receipt.Status != constant.StatusFailed || receipt.EndAt.IsZero() {
		t.Fatalf("failed admission was not recorded: %+v", receipt)
	}
	if err := claimAppInstallTask(db, id, "local-starter"); !errors.Is(err, ErrAppInstallTaskReplay) {
		t.Fatalf("failed receipts must not be released for retry: %v", err)
	}
	// Once task execution has linked an application, admission cleanup can
	// no longer overwrite its status, even if another path reports an error.
	if err := db.Model(&model.Task{}).Where("id = ?", id).
		Updates(map[string]interface{}{
			"status":      constant.StatusExecuting,
			"resource_id": uint(123),
		}).Error; err != nil {
		t.Fatal(err)
	}
	if err := markAppInstallAdmissionFailed(db, id); err != nil {
		t.Fatal(err)
	}
	if err := db.First(&receipt, "id = ?", id).Error; err != nil {
		t.Fatal(err)
	}
	if receipt.Status != constant.StatusExecuting || receipt.ResourceID != 123 {
		t.Fatalf("admission cleanup clobbered started task: %+v", receipt)
	}
}

func TestAppInstallTaskAdmissionSameNameDifferentIDsIsAtomic(t *testing.T) {
    db, _ := appInstallAdmissionDB(t)
    names := []string{"  Jupyter  ", "jupyter", "JUPYTER"}
    const workers = 24
    var wg sync.WaitGroup
    var mu sync.Mutex
    winners, blocked, unexpected := 0, 0, 0
    for i := 0; i < workers; i++ {
        wg.Add(1)
        go func(i int) {
            defer wg.Done()
            // Every iteration has a distinct canonical Task ID.
            id := fmt.Sprintf("%08x-1111-4111-8111-111111111111", i+1)
            err := claimAppInstallTask(db, id, names[i%len(names)])
            mu.Lock()
            defer mu.Unlock()
            switch {
            case err == nil:
                winners++
            case errors.Is(err, ErrAppInstallNameReserved):
                blocked++
            default:
                unexpected++
            }
        }(i)
    }
    wg.Wait()
    if winners != 1 || blocked != workers-1 || unexpected != 0 {
        t.Fatalf("accepted=%d blocked=%d unexpected=%d", winners, blocked, unexpected)
    }
    var tasks int64
    if err := db.Model(&model.Task{}).Count(&tasks).Error; err != nil { t.Fatal(err) }
    if tasks != 1 { t.Fatalf("rejected names left orphan TaskDB receipts: %d", tasks) }
    var claims []model.AppInstallNameClaim
    if err := db.Find(&claims).Error; err != nil { t.Fatal(err) }
    if len(claims) != 1 || claims[0].NameKey != "jupyter" {
        t.Fatalf("unexpected claim state %+v", claims)
    }
}

func TestAppInstallTaskNameClaimSurvivesRestartStatusChanges(t *testing.T) {
    db, path := appInstallAdmissionDB(t)
    id := "55555555-5555-4555-8555-555555555555"
    if err := claimAppInstallTask(db, id, "Notebook"); err != nil { t.Fatal(err) }
    if err := db.Model(&model.Task{}).Where("id = ?", id).
        Update("status", constant.StatusUnknown).Error; err != nil { t.Fatal(err) }
    other, err := gorm.Open(sqlite.Open(path), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
    if err != nil { t.Fatal(err) }
    handle, err := other.DB()
    if err != nil { t.Fatal(err) }
    defer handle.Close()
    replay := "66666666-6666-4666-8666-666666666666"
    if err := claimAppInstallTask(other, replay, " notebook "); !errors.Is(err, ErrAppInstallNameReserved) {
        t.Fatalf("restart lost name owner: %v", err)
    }
    if err := db.Model(&model.Task{}).Where("id = ?", id).
        Update("status", constant.StatusSuccess).Error; err != nil { t.Fatal(err) }
    if err := claimAppInstallTask(other, replay, "NOTEBOOK"); !errors.Is(err, ErrAppInstallNameReserved) {
        t.Fatalf("completed task unexpectedly released its unresolved name owner: %v", err)
    }
    var leaked int64
    if err := other.Model(&model.Task{}).Where("id = ?", replay).Count(&leaked).Error; err != nil { t.Fatal(err) }
    if leaked != 0 { t.Fatal("rejected request inserted a Task row") }
}

func TestAppInstallTaskAdmissionFailsClosedWithoutNameClaimSchema(t *testing.T) {
    path := filepath.Join(t.TempDir(), "legacy-task.db")
    db, err := gorm.Open(sqlite.Open(path), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
    if err != nil { t.Fatal(err) }
    handle, err := db.DB()
    if err != nil { t.Fatal(err) }
    defer handle.Close()
    if err := db.AutoMigrate(&model.Task{}); err != nil { t.Fatal(err) }
    if err := claimAppInstallTask(db, "77777777-7777-4777-8777-777777777777", "Jupyter"); err == nil {
        t.Fatal("missing name claim migration admitted an installation")
    }
    var count int64
    if err := db.Model(&model.Task{}).Count(&count).Error; err != nil { t.Fatal(err) }
    if count != 0 { t.Fatal("failed migration claim left unpaired task reservation") }
}

func TestAppInstallNameNormalizationDeniesEmptyAndTooLong(t *testing.T) {
    for _, name := range []string{"", "   ", strings.Repeat("x", 256)} {
        if _, err := NormalizeAppInstallNameKey(name); !errors.Is(err, ErrAppInstallNameInvalid) {
            t.Fatalf("invalid name %q accepted: %v", name, err)
        }
    }
    key, err := NormalizeAppInstallNameKey("  JUPYTER  ")
    if err != nil || key != "jupyter" { t.Fatalf("normalized=%q err=%v", key, err) }
}

func TestAppInstallTaskAdmissionRejectsEmptyIDWithoutOrphanNameClaim(t *testing.T) {
    db, _ := appInstallAdmissionDB(t)
    for _, id := range []string{"", "NOT-A-UUID", "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"} {
        if err := claimAppInstallTask(db, id, "jupyter"); !errors.Is(err, ErrAppInstallTaskID) {
            t.Fatalf("invalid task ID %q admitted: %v", id, err)
        }
    }
    var tasks, claims int64
    if err := db.Model(&model.Task{}).Count(&tasks).Error; err != nil { t.Fatal(err) }
    if err := db.Model(&model.AppInstallNameClaim{}).Count(&claims).Error; err != nil { t.Fatal(err) }
    if tasks != 0 || claims != 0 {
        t.Fatalf("invalid Task ID left task/name claim: tasks=%d claims=%d", tasks, claims)
    }
}

func TestAppInstallTaskAdmissionUnavailableFailsClosed(t *testing.T) {
	if err := claimAppInstallTask(nil, "44444444-4444-4444-8444-444444444444", "app"); err == nil {
		t.Fatal("unavailable TaskDB admitted installation")
	}
	if err := markAppInstallAdmissionFailed(nil, "44444444-4444-4444-8444-444444444444"); err == nil {
		t.Fatal("unavailable TaskDB treated receipt cleanup as successful")
	}
}
