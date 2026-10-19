package migrations

import (
    "fmt"
    "strings"
    "time"

    "github.com/avaargsh/GPUPanel/agent/app/model"
    "github.com/avaargsh/GPUPanel/agent/constant"
    "github.com/go-gormigrate/gormigrate/v2"
    "gorm.io/gorm"
    "gorm.io/gorm/clause"
)

// AddAppInstallNameClaims is additive to task.db. It never deletes previous
// task history, modifies app.db, or releases an ambiguous historical attempt.
var AddAppInstallNameClaims = &gormigrate.Migration{
    ID: "20261019-add-app-install-name-claims",
    Migrate: func(tx *gorm.DB) error {
        if err := tx.AutoMigrate(&model.AppInstallNameClaim{}); err != nil {
            return err
        }
        // Older versions kept UNKNOWN/EXECUTING TaskInstall in TaskDB but had
        // no name-claim table. Preserve those ambiguous names as blockers.
        // Successful historical installs are represented by AppInstall rows;
        // this backfill must not permanently block every previously used name.
        var pending []model.Task
        if err := tx.Model(&model.Task{}).
            Where("type = ? AND operate = ? AND status IN ?",
                "App", "TaskInstall", []string{constant.StatusExecuting, constant.StatusUnknown}).
            Order("created_at ASC").Order("id ASC").Find(&pending).Error; err != nil {
            return fmt.Errorf("read legacy interrupted installs: %w", err)
        }
        for _, previous := range pending {
            name := strings.TrimSpace(previous.Name)
            // Task.NewTaskWithOps stores a translated label ending in [name];
            // pre-execution admissions store the plain requested name.
            if strings.HasSuffix(name, "]") {
                if index := strings.LastIndex(name, " ["); index >= 0 {
                    name = name[index+2 : len(name)-1]
                }
            }
            key := strings.ToLower(strings.TrimSpace(name))
            if key == "" || len(key) > 255 {
                return fmt.Errorf("legacy unresolved installation %s has an unclassifiable name; manual review required", previous.ID)
            }
            row := &model.AppInstallNameClaim{
                NameKey: key, TaskID: previous.ID, CreatedAt: time.Now().UTC(),
            }
            // Multiple historical UNKNOWN tasks for one name may already
            // exist. One immutable name owner is enough to block all retries;
            // retain every original Task record for operator reconciliation.
            if err := tx.Clauses(clause.OnConflict{
                Columns: []clause.Column{{Name: "name_key"}}, DoNothing: true,
            }).Create(row).Error; err != nil {
                return fmt.Errorf("backfill unresolved installation name: %w", err)
            }
        }
        return nil
    },
}
