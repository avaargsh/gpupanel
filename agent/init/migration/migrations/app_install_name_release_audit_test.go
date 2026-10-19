package migrations

import (
	"testing"
	"time"

	"github.com/avaargsh/GPUPanel/agent/app/model"
)

func TestAppInstallReleaseAuditMigrationIsAdditiveAndReplaySafe(t *testing.T) {
	db := taskNameMigrationDB(t)
	if err := AddAppInstallNameClaims.Migrate(db); err != nil { t.Fatal(err) }
	if err := AddAppInstallNameReleaseAudit.Migrate(db); err != nil { t.Fatal(err) }
	row := model.AppInstallNameReleaseAudit{
		RequestID: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
		NameKey: "jupyter",
		OwnerTaskID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
		OperatorID: "admin-test",
		EvidenceSHA256: "abababababababababababababababababababababababababababababababab",
		CreatedAt: time.Now().UTC(),
	}
	if err := db.Create(&row).Error; err != nil { t.Fatal(err) }
	// A restart or repeated migration must not lose immutable audit records.
	if err := AddAppInstallNameReleaseAudit.Migrate(db); err != nil { t.Fatal(err) }
	var found model.AppInstallNameReleaseAudit
	if err := db.First(&found, "request_id = ?", row.RequestID).Error; err != nil { t.Fatal(err) }
	if found.OwnerTaskID != row.OwnerTaskID || found.NameKey != row.NameKey ||
		found.EvidenceSHA256 != row.EvidenceSHA256 {
		t.Fatalf("migration altered release audit: %+v", found)
	}
	if err := db.Create(&row).Error; err == nil {
		t.Fatal("same release request UUID created a second audit entry")
	}
	var count int64
	if err := db.Model(&model.AppInstallNameReleaseAudit{}).Count(&count).Error; err != nil { t.Fatal(err) }
	if count != 1 { t.Fatalf("non-idempotent audit migration: rows=%d", count) }
}
