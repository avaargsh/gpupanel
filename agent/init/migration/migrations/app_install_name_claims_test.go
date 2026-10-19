package migrations

import (
    "path/filepath"
    "testing"

    "github.com/avaargsh/GPUPanel/agent/app/model"
    "github.com/avaargsh/GPUPanel/agent/constant"
    "github.com/glebarez/sqlite"
    "gorm.io/gorm"
    "gorm.io/gorm/logger"
)

func taskNameMigrationDB(t *testing.T) *gorm.DB {
    t.Helper()
    path := filepath.Join(t.TempDir(), "task.db")
    db, err := gorm.Open(sqlite.Open(path), &gorm.Config{
        Logger: logger.Default.LogMode(logger.Silent),
    })
    if err != nil { t.Fatal(err) }
    if err := db.AutoMigrate(&model.Task{}); err != nil { t.Fatal(err) }
    sqlDB, err := db.DB()
    if err != nil { t.Fatal(err) }
    t.Cleanup(func() { _ = sqlDB.Close() })
    return db
}

func TestAppInstallNameClaimMigrationBackfillsOnlyUnresolved(t *testing.T) {
    db := taskNameMigrationDB(t)
    rows := []model.Task{
        {ID: "old-executing", Name: " jupyter ", Type: "App", Operate: "TaskInstall", Status: constant.StatusExecuting},
        {ID: "old-unknown", Name: "Install App [MaxKB]", Type: "App", Operate: "TaskInstall", Status: constant.StatusUnknown},
        {ID: "duplicate-unknown", Name: "install app [MAXKB]", Type: "App", Operate: "TaskInstall", Status: constant.StatusUnknown},
        {ID: "old-success", Name: "Install App [Legacy]", Type: "App", Operate: "TaskInstall", Status: constant.StatusSuccess},
        {ID: "other-scope", Name: "web", Type: "Website", Operate: "TaskInstall", Status: constant.StatusUnknown},
    }
    for i := range rows {
        if err := db.Create(&rows[i]).Error; err != nil { t.Fatal(err) }
    }
    if err := AddAppInstallNameClaims.Migrate(db); err != nil { t.Fatal(err) }
    var claims []model.AppInstallNameClaim
    if err := db.Order("name_key ASC").Find(&claims).Error; err != nil { t.Fatal(err) }
    if len(claims) != 2 || claims[0].NameKey != "jupyter" || claims[1].NameKey != "maxkb" {
        t.Fatalf("incorrect historical blockers: %+v", claims)
    }
    // Running the body again must not mutate, erase or multiply retained claims.
    if err := AddAppInstallNameClaims.Migrate(db); err != nil { t.Fatal(err) }
    var count int64
    if err := db.Model(&model.AppInstallNameClaim{}).Count(&count).Error; err != nil { t.Fatal(err) }
    if count != 2 { t.Fatalf("duplicate backfill created %d claims", count) }
    var original int64
    if err := db.Model(&model.Task{}).Count(&original).Error; err != nil { t.Fatal(err) }
    if original != int64(len(rows)) { t.Fatal("migration altered original task history") }
}

func TestAppInstallNameClaimMigrationRejectsUnclassifiableLegacyName(t *testing.T) {
    db := taskNameMigrationDB(t)
    if err := db.Create(&model.Task{
        ID: "legacy-corrupt", Name: "   ", Type: "App", Operate: "TaskInstall",
        Status: constant.StatusUnknown,
    }).Error; err != nil { t.Fatal(err) }
    if err := AddAppInstallNameClaims.Migrate(db); err == nil {
        t.Fatal("legacy unresolved task with no name must require manual review")
    }
}
