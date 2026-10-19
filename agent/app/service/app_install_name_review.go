package service

import (
    "errors"

    "github.com/avaargsh/GPUPanel/agent/app/model"
    "github.com/avaargsh/GPUPanel/agent/app/task"
    "gorm.io/gorm"
)

// AppInstallNameReview is a bounded, redacted read projection of the durable
// installation name claim. It never authorizes retry, release or repair.
// TaskDB and app.db are not a jointly committed snapshot; Docker and
// filesystem effects are deliberately NOT inferred from missing DB rows.
type AppInstallNameReview struct {
    NameKey          string   `json:"nameKey"`
    OwnerTaskID      string   `json:"ownerTaskId,omitempty"`
    OwnerStatus      string   `json:"ownerStatus,omitempty"`
    OwnerResourceID  uint     `json:"ownerResourceId,omitempty"`
    AppInstallIDs    []uint   `json:"appInstallIds"`
    Reasons          []string `json:"reasons"`
    ObservationalOnly bool    `json:"observationalOnly"`
    Verified         bool     `json:"verified"`
    CanRelease       bool     `json:"canRelease"`
}

// reviewAppInstallNameClaim uses only existing TaskDB/AppDB read APIs. There
// is intentionally no HTTP entrypoint and no release mutation in this slice.
// Consumers MUST require authenticated admin scope and fresh independent
// Docker/filesystem verification before a future CAS-based release.
func reviewAppInstallNameClaim(taskDB, appDB *gorm.DB, name string) (AppInstallNameReview, error) {
    out := AppInstallNameReview{
        AppInstallIDs: []uint{}, Reasons: []string{}, ObservationalOnly: true,
        Verified: false, CanRelease: false,
    }
    key, err := NormalizeAppInstallNameKey(name)
    if err != nil {
        return out, err
    }
    out.NameKey = key
    if taskDB == nil {
        out.Reasons = append(out.Reasons, "TASK_DB_UNAVAILABLE")
        return out, nil
    }
    var claim model.AppInstallNameClaim
    err = taskDB.Model(&model.AppInstallNameClaim{}).Where("name_key = ?", key).Take(&claim).Error
    switch {
    case errors.Is(err, gorm.ErrRecordNotFound):
        out.Reasons = append(out.Reasons, "NAME_CLAIM_NOT_FOUND")
    case err != nil:
        out.Reasons = append(out.Reasons, "NAME_CLAIM_READ_FAILED")
    default:
        out.OwnerTaskID = claim.TaskID
        var owner model.Task
        err = taskDB.Model(&model.Task{}).Select(
            "id", "type", "operate", "status", "resource_id",
        ).Where("id = ?", claim.TaskID).Take(&owner).Error
        switch {
        case errors.Is(err, gorm.ErrRecordNotFound):
            out.Reasons = append(out.Reasons, "OWNER_TASK_MISSING")
        case err != nil:
            out.Reasons = append(out.Reasons, "OWNER_TASK_READ_FAILED")
        case owner.Type != task.TaskScopeApp || owner.Operate != task.TaskInstall:
            out.Reasons = append(out.Reasons, "OWNER_TASK_IDENTITY_CONFLICT")
        default:
            out.OwnerStatus, out.OwnerResourceID = owner.Status, owner.ResourceID
            if owner.ResourceID == 0 {
                out.Reasons = append(out.Reasons, "OWNER_RESOURCE_NOT_LINKED")
            } else {
                out.Reasons = append(out.Reasons, "OWNER_RESOURCE_NEEDS_INDEPENDENT_REVIEW")
            }
            if owner.Status == "Unknown" || owner.Status == "Executing" {
                out.Reasons = append(out.Reasons, "OWNER_OUTCOME_UNRESOLVED")
            }
        }
    }
    if appDB == nil {
        out.Reasons = append(out.Reasons, "APP_DB_UNAVAILABLE")
        return out, nil
    }
    // Scan name+id only. SQLite LOWER is ASCII-only while Go lowercasing
    // admits other Unicode: compare in Go, never falsely conclude no owners.
    // Saturation is UNKNOWN, not evidence of absence.
    const maxScan = 256
    var existing []model.AppInstall
    if err := appDB.Model(&model.AppInstall{}).Select("id", "name").
        Order("id ASC").Limit(maxScan + 1).Find(&existing).Error; err != nil {
        out.Reasons = append(out.Reasons, "APP_DB_READ_FAILED")
        return out, nil
    }
    if len(existing) > maxScan {
        out.Reasons = append(out.Reasons, "APP_DB_SCAN_SATURATED")
        return out, nil
    }
    for _, item := range existing {
        itemKey, normalizeErr := NormalizeAppInstallNameKey(item.Name)
        if normalizeErr != nil {
            out.Reasons = append(out.Reasons, "APP_NAME_NOT_CLASSIFIABLE")
            continue
        }
        if itemKey == key {
            out.AppInstallIDs = append(out.AppInstallIDs, item.ID)
        }
    }
    if len(out.AppInstallIDs) > 0 {
        out.Reasons = append(out.Reasons, "APP_INSTALL_ROW_PRESENT")
    } else {
        out.Reasons = append(out.Reasons, "NO_APP_ROW_IS_NOT_DOCKER_OR_FILESYSTEM_PROOF")
    }
    // No evidence of Docker volume identity, compose project, filesystem
    // ownership, or full audit approval is available in this two-DB read.
    out.Reasons = append(out.Reasons, "INDEPENDENT_RESOURCE_REVIEW_REQUIRED")
    return out, nil
}

