package service

import (
    "errors"
    "path/filepath"
    "slices"
    "testing"

    "github.com/avaargsh/GPUPanel/agent/app/model"
    "github.com/avaargsh/GPUPanel/agent/app/task"
    "github.com/avaargsh/GPUPanel/agent/constant"
    "github.com/glebarez/sqlite"
    "gorm.io/gorm"
    "gorm.io/gorm/logger"
)

func nameReviewAppDB(t *testing.T) *gorm.DB {
    t.Helper()
    db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "app.db")), &gorm.Config{
        Logger: logger.Default.LogMode(logger.Silent),
    })
    if err != nil { t.Fatal(err) }
    if err := db.Exec("CREATE TABLE app_installs (id integer primary key, name text NOT NULL)").Error; err != nil {
        t.Fatal(err)
    }
    sqlDB, err := db.DB()
    if err != nil { t.Fatal(err) }
    t.Cleanup(func() { _ = sqlDB.Close() })
    return db
}

func addNameOwner(t *testing.T, db *gorm.DB, name, id, status string, resource uint) {
    t.Helper()
    key, err := NormalizeAppInstallNameKey(name)
    if err != nil { t.Fatal(err) }
    if err := db.Create(&model.AppInstallNameClaim{NameKey: key, TaskID: id}).Error; err != nil {
        t.Fatal(err)
    }
    if err := db.Create(&model.Task{
        ID: id, Name: name, Type: task.TaskScopeApp, Operate: task.TaskInstall,
        Status: status, ResourceID: resource,
    }).Error; err != nil { t.Fatal(err) }
}

func TestNameReviewUNKNOWNWithoutResourceCannotAuthorizeRelease(t *testing.T) {
    taskDB, _ := appInstallAdmissionDB(t)
    appDB := nameReviewAppDB(t)
    id := "11111111-1111-4111-8111-111111111111"
    addNameOwner(t, taskDB, " Jupyter ", id, constant.StatusUnknown, 0)
    result, err := reviewAppInstallNameClaim(taskDB, appDB, "jupyter")
    if err != nil { t.Fatal(err) }
    if result.NameKey != "jupyter" || result.OwnerTaskID != id ||
        result.OwnerStatus != constant.StatusUnknown || result.OwnerResourceID != 0 {
        t.Fatalf("review lost source attribution: %+v", result)
    }
    for _, reason := range []string{
        "OWNER_RESOURCE_NOT_LINKED", "OWNER_OUTCOME_UNRESOLVED",
        "NO_APP_ROW_IS_NOT_DOCKER_OR_FILESYSTEM_PROOF",
        "INDEPENDENT_RESOURCE_REVIEW_REQUIRED",
    } {
        if !slices.Contains(result.Reasons, reason) {
            t.Fatalf("missing fail-closed reason %q in %+v", reason, result.Reasons)
        }
    }
    if result.CanRelease || result.Verified || !result.ObservationalOnly {
        t.Fatalf("read-only UNKNOWN became release authorization: %+v", result)
    }
}

func TestNameReviewCannotReleaseEvenWhenTaskSucceededAndAppRowExists(t *testing.T) {
    taskDB, _ := appInstallAdmissionDB(t)
    appDB := nameReviewAppDB(t)
    id := "22222222-2222-4222-8222-222222222222"
    addNameOwner(t, taskDB, "maxkb", id, constant.StatusSuccess, 42)
    if err := appDB.Exec("INSERT INTO app_installs(id, name) VALUES (?, ?)", 42, "MAXKB").Error; err != nil {
        t.Fatal(err)
    }
    got, err := reviewAppInstallNameClaim(taskDB, appDB, " MaXkB ")
    if err != nil { t.Fatal(err) }
    if len(got.AppInstallIDs) != 1 || got.AppInstallIDs[0] != 42 ||
        !slices.Contains(got.Reasons, "APP_INSTALL_ROW_PRESENT") {
        t.Fatalf("linked row missing from review: %+v", got)
    }
    if got.CanRelease || got.Verified { t.Fatal("success or installed row must not release name") }
}

func TestNameReviewWrongTaskIdentityAndMissingRecordRemainBlocked(t *testing.T) {
    taskDB, _ := appInstallAdmissionDB(t)
    appDB := nameReviewAppDB(t)
    id := "33333333-3333-4333-8333-333333333333"
    addNameOwner(t, taskDB, "notebook", id, constant.StatusFailed, 0)
    if err := taskDB.Model(&model.Task{}).Where("id = ?", id).
        Update("type", "Compose").Error; err != nil { t.Fatal(err) }
    got, err := reviewAppInstallNameClaim(taskDB, appDB, "notebook")
    if err != nil || !slices.Contains(got.Reasons, "OWNER_TASK_IDENTITY_CONFLICT") ||
        got.Verified || got.CanRelease {
        t.Fatalf("cross-scope owner was trusted: %+v err=%v", got, err)
    }
    if err := taskDB.Delete(&model.Task{}, "id = ?", id).Error; err != nil { t.Fatal(err) }
    got, err = reviewAppInstallNameClaim(taskDB, appDB, "notebook")
    if err != nil || !slices.Contains(got.Reasons, "OWNER_TASK_MISSING") || got.CanRelease {
        t.Fatalf("orphan name claim was trusted: %+v err=%v", got, err)
    }
}

func TestNameReviewMissingClaimsAndUnavailableDBsAreNotReleaseProof(t *testing.T) {
    taskDB, _ := appInstallAdmissionDB(t)
    appDB := nameReviewAppDB(t)
    got, err := reviewAppInstallNameClaim(taskDB, appDB, "new-name")
    if err != nil || !slices.Contains(got.Reasons, "NAME_CLAIM_NOT_FOUND") || got.CanRelease {
        t.Fatalf("missing owner incorrectly indicates safe reuse: %+v err=%v", got, err)
    }
    got, err = reviewAppInstallNameClaim(nil, appDB, "new-name")
    if err != nil || !slices.Contains(got.Reasons, "TASK_DB_UNAVAILABLE") || got.CanRelease {
        t.Fatalf("missing TaskDB became success: %+v err=%v", got, err)
    }
    got, err = reviewAppInstallNameClaim(taskDB, nil, "new-name")
    if err != nil || !slices.Contains(got.Reasons, "APP_DB_UNAVAILABLE") || got.CanRelease {
        t.Fatalf("missing AppDB became success: %+v err=%v", got, err)
    }
    if _, err := reviewAppInstallNameClaim(taskDB, appDB, "  "); !errors.Is(err, ErrAppInstallNameInvalid) {
        t.Fatalf("empty name accepted: %v", err)
    }
}

func TestNameReviewReadFailureAndSaturatedScanCannotAuthorizeRelease(t *testing.T) {
    taskDB, _ := appInstallAdmissionDB(t)
    appDB := nameReviewAppDB(t)
    if err := appDB.Exec("DROP TABLE app_installs").Error; err != nil { t.Fatal(err) }
    got, err := reviewAppInstallNameClaim(taskDB, appDB, "jupyter")
    if err != nil || !slices.Contains(got.Reasons, "APP_DB_READ_FAILED") || got.CanRelease {
        t.Fatalf("AppDB error hidden: %+v err=%v", got, err)
    }
    if err := appDB.Exec("CREATE TABLE app_installs (id integer primary key, name text NOT NULL)").Error; err != nil {
        t.Fatal(err)
    }
    for i := 1; i <= 257; i++ {
        if err := appDB.Exec("INSERT INTO app_installs(id, name) VALUES (?, ?)", i, "unrelated").Error; err != nil {
            t.Fatal(err)
        }
    }
    got, err = reviewAppInstallNameClaim(taskDB, appDB, "jupyter")
    if err != nil || !slices.Contains(got.Reasons, "APP_DB_SCAN_SATURATED") || got.CanRelease {
        t.Fatalf("saturated name scan became proof: %+v err=%v", got, err)
    }
}
