package migrations

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/avaargsh/GPUPanel/agent/app/model"
	"github.com/avaargsh/GPUPanel/agent/global"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// Exercise the real migration owner against an old, disposable monitoring DB.
// Recovery here is an offline SQLite backup restore, not a live-host rollback.
func TestVLLMRequestMetricsPreservesOldRowsAndOfflineBackup(t *testing.T) {
	root := t.TempDir()
	filename := filepath.Join(root, "monitor.db")
	open := func(path string) *gorm.DB {
		db, err := gorm.Open(sqlite.Open(path), &gorm.Config{})
		if err != nil {
			t.Fatal(err)
		}
		return db
	}
	closeDB := func(db *gorm.DB) {
		sql, err := db.DB()
		if err != nil {
			t.Fatal(err)
		}
		if err := sql.Close(); err != nil {
			t.Fatal(err)
		}
	}
	type oldMetrics struct {
		ID              uint `gorm:"primarykey"`
		CreatedAt       time.Time
		AppInstallID    uint
		Status          string
		RawMetrics      string
		HistogramDeltas string
	}
	before := open(filename)
	if err := before.Table("monitor_vllms").AutoMigrate(&oldMetrics{}); err != nil {
		t.Fatal(err)
	}
	old := oldMetrics{ID: 1, AppInstallID: 7, Status: "Running", RawMetrics: "original observation"}
	if err := before.Table("monitor_vllms").Create(&old).Error; err != nil {
		t.Fatal(err)
	}
	closeDB(before)
	backup, err := os.ReadFile(filename)
	if err != nil {
		t.Fatal(err)
	}
	monitor := open(filename)
	previous := global.VLLMMonitorDB
	global.VLLMMonitorDB = monitor
	t.Cleanup(func() { global.VLLMMonitorDB = previous; closeDB(monitor) })
	for i := 0; i < 2; i++ {
		if err := AddVLLMRequestMetrics.Migrate(monitor); err != nil {
			t.Fatal(err)
		}
	}
	var retained model.MonitorVLLM
	if err := monitor.First(&retained, 1).Error; err != nil {
		t.Fatal(err)
	}
	if retained.RawMetrics != old.RawMetrics || retained.AppInstallID != 7 || retained.QueueTime != nil {
		t.Fatalf("old monitoring observation changed: %+v", retained)
	}
	if !monitor.Migrator().HasColumn(&model.MonitorVLLM{}, "request_deltas") {
		t.Fatal("new column missing")
	}
	restored := filepath.Join(root, "restored.db")
	if err := os.WriteFile(restored, backup, 0600); err != nil {
		t.Fatal(err)
	}
	recovery := open(restored)
	defer closeDB(recovery)
	var row oldMetrics
	if err := recovery.Table("monitor_vllms").First(&row, 1).Error; err != nil {
		t.Fatal(err)
	}
	if row.RawMetrics != old.RawMetrics || recovery.Migrator().HasColumn("monitor_vllms", "request_deltas") {
		t.Fatal("offline backup recovery did not retain the pre-migration schema/data")
	}
}
