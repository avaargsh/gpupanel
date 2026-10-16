package migrations

import (
	"github.com/avaargsh/GPUPanel/core/app/workspace"
	"github.com/go-gormigrate/gormigrate/v2"
	"gorm.io/gorm"
)

// Only a separate additive table; no existing Workspace state is updated.
var AddWorkspaceLocalEvidence = &gormigrate.Migration{
	ID: "20261017-add-workspace-local-evidence",
	Migrate: func(tx *gorm.DB) error {
		return tx.AutoMigrate(&workspace.LocalEvidence{})
	},
}
