package service

import (
	"errors"
	"path/filepath"
	"sync"
	"testing"

	"github.com/1Panel-dev/1Panel/agent/app/model"
	"github.com/1Panel-dev/1Panel/agent/app/task"
	"github.com/1Panel-dev/1Panel/agent/constant"
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
	if err := db.AutoMigrate(&model.Task{}); err != nil {
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
		"../../other.log", "/tmp/receipt", "not-a-uuid",
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
			"status": constant.StatusExecuting,
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

func TestAppInstallTaskAdmissionUnavailableFailsClosed(t *testing.T) {
	if err := claimAppInstallTask(nil, "44444444-4444-4444-8444-444444444444", "app"); err == nil {
		t.Fatal("unavailable TaskDB admitted installation")
	}
	if err := markAppInstallAdmissionFailed(nil, "44444444-4444-4444-8444-444444444444"); err == nil {
		t.Fatal("unavailable TaskDB treated receipt cleanup as successful")
	}
}
