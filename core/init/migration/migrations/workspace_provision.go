package migrations

import (
	"github.com/avaargsh/GPUPanel/core/app/workspace"
	"github.com/go-gormigrate/gormigrate/v2"
	"gorm.io/gorm"
)

// Additive request-only intent table, never an executable job queue.
// Existing Project and Workspace states remain unchanged.
var AddWorkspaceProvisionIntent = &gormigrate.Migration{
	ID: "20261017-add-workspace-provision-intent",
	Migrate: func(tx *gorm.DB) error {
		return tx.AutoMigrate(&workspace.ProvisionIntent{})
	},
}
