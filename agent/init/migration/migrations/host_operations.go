package migrations

import (
	"github.com/avaargsh/GPUPanel/agent/app/hostops"
	"github.com/go-gormigrate/gormigrate/v2"
	"gorm.io/gorm"
)

// Additive task.db table. Existing Task and application records are untouched.
var AddHostOperations = &gormigrate.Migration{
	ID:      "20261016-add-host-operations",
	Migrate: func(tx *gorm.DB) error { return tx.AutoMigrate(&hostops.Receipt{}) },
	// Production rollback keeps receipts. Reverting code does not drop audit data.
}
