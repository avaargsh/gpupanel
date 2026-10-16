package workspace

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func registryTestDB(t *testing.T, path string) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(path), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&Project{}, &Workspace{}, &ProvisionIntent{}); err != nil {
		t.Fatal(err)
	}
	return db
}

func TestRegistryPersistsProjectAndDefaultWorkspaceAcrossReopen(t *testing.T) {
	path := filepath.Join(t.TempDir(), "core.db")
	db := registryTestDB(t, path)
	ctx := context.Background()
	got, err := New(db).Create(ctx, "owner-a", "实验项目", "uv")
	if err != nil || got.State != Registered || len(got.Workspaces) != 1 ||
		got.Workspaces[0].State != NotProvisioned || got.Workspaces[0].Name != "default" {
		t.Fatalf("metadata registration failed: %#v err=%v", got, err)
	}
	sqlDB, err := db.DB()
	if err != nil { t.Fatal(err) }
	if err := sqlDB.Close(); err != nil { t.Fatal(err) }
	reopened := registryTestDB(t, path)
	again, err := New(reopened).List(ctx, "owner-a")
	if err != nil || len(again) != 1 || again[0].ID != got.ID ||
		len(again[0].Workspaces) != 1 || again[0].Workspaces[0].ID != got.Workspaces[0].ID {
		t.Fatalf("registry not durable after reopened SQLite: %#v err=%v", again, err)
	}
	// Replaying a successful registration must never replace its workspace.
	if _, err := New(reopened).Create(ctx, "owner-a", "实验项目", "catalog"); !errors.Is(err, ErrConflict) {
		t.Fatalf("duplicate registered a new workspace: %v", err)
	}
	var count int64
	if err := reopened.Model(&Workspace{}).Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("unexpected workspace mutation: count=%d err=%v", count, err)
	}
}

func TestRegistryOwnerIsolationAndUnverifiedSource(t *testing.T) {
	db := registryTestDB(t, filepath.Join(t.TempDir(), "core.db"))
	ctx := context.Background()
	r := New(db)
	for _, owner := range []string{"owner-a", "owner-b"} {
		if _, err := r.Create(ctx, owner, "same-name", "manual"); err != nil { t.Fatal(err) }
	}
	for _, owner := range []string{"owner-a", "owner-b"} {
		items, err := r.List(ctx, owner)
		if err != nil || len(items) != 1 || len(items[0].Workspaces) != 1 ||
			items[0].SourceHint != "manual" || items[0].OwnerID != owner ||
			items[0].Workspaces[0].OwnerID != owner {
			t.Fatalf("owner %s leaked workspace/project: %#v %v", owner, items, err)
		}
	}
	items, err := r.List(ctx, "owner-c")
	if err != nil || len(items) != 0 { t.Fatalf("unexpected entries: %#v %v", items, err) }
}

func TestRegistryRejectsUntrustedMetadataBeforeWriting(t *testing.T) {
	db := registryTestDB(t, filepath.Join(t.TempDir(), "core.db"))
	r := New(db)
	cases := []struct{ owner, name, source string }{
		{"", "valid", "manual"}, {" owner", "valid", "uv"},
		{"owner-a", "../escape", "uv"}, {"owner-a", "a/b", "manual"},
		{"owner-a", ".", "catalog"}, {"owner-a", "\x00evil", "uv"},
		{"owner-a", "name", "shell"}, {"owner-a", "", "uv"},
		{"owner-a", "valid", ""},
	}
	for _, c := range cases {
		if _, err := r.Create(context.Background(), c.owner, c.name, c.source); !errors.Is(err, ErrInvalidInput) {
			t.Fatalf("accepted invalid owner/name/source %+v: %v", c, err)
		}
	}
	var count int64
	if err := db.Model(&Project{}).Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("invalid metadata created project rows: %d %v", count, err)
	}
}

func TestRegistryTransactionRollsBackIfWorkspaceInsertFails(t *testing.T) {
	db := registryTestDB(t, filepath.Join(t.TempDir(), "core.db"))
	if err := db.Exec("DROP TABLE workspaces").Error; err != nil { t.Fatal(err) }
	_, err := New(db).Create(context.Background(), "owner-a", "rollback", "manual")
	if err == nil { t.Fatal("expected missing workspace table to prevent registration") }
	var count int64
	if err := db.Model(&Project{}).Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("project persisted without workspace: %d %v", count, err)
	}
}

func TestRegistryFailsClosedWithoutDatabaseOrIdentity(t *testing.T) {
	if _, err := New(nil).List(context.Background(), "admin"); err == nil { t.Fatal("nil DB accepted") }
	if _, err := New(nil).Create(context.Background(), "admin", "test", "uv"); err == nil { t.Fatal("nil DB accepted") }
	db := registryTestDB(t, filepath.Join(t.TempDir(), "core.db"))
	if _, err := New(db).List(context.Background(), ""); !errors.Is(err, ErrInvalidInput) { t.Fatal(err) }
}

func TestGetProjectOwnerScopedAndReopen(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "core.db")
	db := registryTestDB(t, path)
	r := New(db)
	a, err := r.Create(ctx, "owner-a", "GPU", "uv")
	if err != nil { t.Fatal(err) }
	b, err := r.Create(ctx, "owner-b", "private", "manual")
	if err != nil { t.Fatal(err) }
	got, err := r.Get(ctx, "owner-a", a.ID)
	if err != nil || got.ID != a.ID || len(got.Workspaces) != 1 ||
		got.Workspaces[0].State != NotProvisioned {
		t.Fatalf("owner detail cannot be read: %#v %v", got, err)
	}
	for _, id := range []string{b.ID, "invalid-uuid", "", "00000000-0000-0000-0000-000000000000"} {
		_, err := r.Get(ctx, "owner-a", id)
		if !errors.Is(err, ErrNotFound) { t.Fatalf("foreign/missing ID %q: %v", id, err) }
	}
	if _, err := r.Get(ctx, "", a.ID); !errors.Is(err, ErrInvalidInput) { t.Fatal(err) }
	sqlDB, err := db.DB()
	if err != nil { t.Fatal(err) }
	if err := sqlDB.Close(); err != nil { t.Fatal(err) }
	again, err := New(registryTestDB(t, path)).Get(ctx, "owner-a", a.ID)
	if err != nil || again.ID != a.ID || len(again.Workspaces) != 1 ||
		again.Workspaces[0].ID != a.Workspaces[0].ID {
		t.Fatalf("detail lost on SQLite restart: %#v %v", again, err)
	}
}
