package migrations

import (
	"github.com/avaargsh/GPUPanel/core/app/workspace"
	"github.com/go-gormigrate/gormigrate/v2"
	"gorm.io/gorm"
)

// Additive: registration metadata only; never scans, adopts or migrates
// existing Catalog/uv files and never starts a workload.
var AddProjectWorkspaceRegistry = &gormigrate.Migration{
	ID: "20261017-add-project-workspace-registry",
	Migrate: func(tx *gorm.DB) error {
		return tx.AutoMigrate(&workspace.Project{}, &workspace.Workspace{})
	},
}
