package migrations

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/avaargsh/GPUPanel/agent/app/hostops"
	"github.com/avaargsh/GPUPanel/agent/app/model"
	"github.com/glebarez/sqlite"
	"github.com/go-gormigrate/gormigrate/v2"
	"gorm.io/gorm"
)

func TestHostOperationsMigrationPreservesTasksAndBackupRestore(t *testing.T) {
	path := filepath.Join(t.TempDir(), "task.db")
	db, err := gorm.Open(sqlite.Open(path), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.Task{}); err != nil {
		t.Fatal(err)
	}
	original := model.Task{ID: "existing-task", Name: "preserve", Status: "Success"}
	if err := db.Create(&original).Error; err != nil {
		t.Fatal(err)
	}
	sql, _ := db.DB()
	sql.Close()
	backup, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	db, err = gorm.Open(sqlite.Open(path), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	migration := gormigrate.New(db, gormigrate.DefaultOptions, []*gormigrate.Migration{AddHostOperations})
	if err := migration.Migrate(); err != nil {
		t.Fatal(err)
	}
	if err := migration.Migrate(); err != nil {
		t.Fatal(err)
	}
	if !db.Migrator().HasTable(&hostops.Receipt{}) {
		t.Fatal("receipt table missing")
	}
	var task model.Task
	if db.First(&task, "id = ?", original.ID).Error != nil || task.Name != "preserve" || task.Status != "Success" {
		t.Fatal("old task changed")
	}
	sql, _ = db.DB()
	sql.Close()
	restored := filepath.Join(t.TempDir(), "restored.db")
	if err := os.WriteFile(restored, backup, 0600); err != nil {
		t.Fatal(err)
	}
	db, err = gorm.Open(sqlite.Open(restored), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sql, _ = db.DB()
	defer sql.Close()
	if db.Migrator().HasTable(&hostops.Receipt{}) || db.First(&task, "id = ?", original.ID).Error != nil || task.Status != "Success" {
		t.Fatal("offline backup did not restore old schema/data")
	}
}
