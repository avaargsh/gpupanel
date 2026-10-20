package migrations

import (
	"github.com/avaargsh/GPUPanel/agent/app/model"
	"github.com/go-gormigrate/gormigrate/v2"
	"gorm.io/gorm"
)

// AddAppInstallNameReleaseAudit is additive and must run after name claims.
// A release requires this schema; no audit table means no owner CAS.
var AddAppInstallNameReleaseAudit = &gormigrate.Migration{
	ID: "20261019-add-app-install-name-release-audit",
	Migrate: func(tx *gorm.DB) error {
		return tx.AutoMigrate(&model.AppInstallNameReleaseAudit{})
	},
}
