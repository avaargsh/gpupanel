package repo

import (
    "path/filepath"
    "testing"

    "github.com/1Panel-dev/1Panel/agent/app/model"
    "github.com/1Panel-dev/1Panel/agent/constant"
    "github.com/glebarez/sqlite"
    "gorm.io/gorm"
    "gorm.io/gorm/logger"
)

func TestInterruptedAppInstallTaskRemainsUnknownAfterRestart(t *testing.T) {
    path := filepath.Join(t.TempDir(), "task.db")
    db, err := gorm.Open(sqlite.Open(path), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
    if err != nil { t.Fatal(err) }
    if err := db.AutoMigrate(&model.Task{}); err != nil { t.Fatal(err) }

    cases := []model.Task{
        {ID:"pre-side-effect", Name:"jupyter", Type:"App", Operate:"TaskInstall", Status:constant.StatusExecuting, ResourceID:0},
        {ID:"after-insert", Name:"maxkb", Type:"App", Operate:"TaskInstall", Status:constant.StatusExecuting, ResourceID:29},
        {ID:"unrelated", Name:"other-task", Type:"Container", Operate:"TaskUpdate", Status:constant.StatusExecuting},
        {ID:"already-done", Name:"done", Type:"App", Operate:"TaskInstall", Status:constant.StatusSuccess},
    }
    // Use a known Task operation for the unrelated record; no operation
    // semantics are executed by this task DB test.
    cases[2].Operate = "TaskUpdate"
    for i := range cases {
        if err := db.Create(&cases[i]).Error; err != nil { t.Fatal(err) }
    }
    if err := reconcileRunningTasksOnRestart(db); err != nil { t.Fatal(err) }
    want := map[string]string{
        "pre-side-effect":constant.StatusUnknown,
        "after-insert":constant.StatusUnknown,
        "unrelated":constant.StatusFailed,
        "already-done":constant.StatusSuccess,
    }
    for id, status := range want {
        var got model.Task
        if err := db.Where("id = ?", id).First(&got).Error; err != nil { t.Fatal(err) }
        if got.Status != status { t.Fatalf("%s = %s, want %s", id, got.Status, status) }
        if id != "already-done" && got.EndAt.IsZero() { t.Fatalf("%s missing interruption time", id) }
        if id == "pre-side-effect" && got.ResourceID != 0 { t.Fatal("recovery changed pre-admission resource ID") }
        if id == "after-insert" && got.ResourceID != 29 { t.Fatal("recovery lost installed record reference") }
    }
    if err := reconcileRunningTasksOnRestart(db); err != nil { t.Fatal(err) }
    var after model.Task
    if err := db.Where("id = ?", "after-insert").First(&after).Error; err != nil { t.Fatal(err) }
    if after.Status != constant.StatusUnknown { t.Fatalf("repeat restart changed outcome: %s", after.Status) }
}

func TestInterruptedAppInstallTaskRecoveryFailsClosedWithoutDB(t *testing.T) {
    if err := reconcileRunningTasksOnRestart(nil); err == nil {
        t.Fatal("missing task DB silently accepted")
    }
}
