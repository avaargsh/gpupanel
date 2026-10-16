package workspace

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
)

func TestProvisionIntentDurableReplayAndNeverProvisioned(t *testing.T) {
	path := filepath.Join(t.TempDir(), "core.db")
	db := registryTestDB(t, path)
	reg := New(db)
	ctx := context.Background()
	project, err := reg.Create(ctx, "owner-a", "offline notebooks", "uv")
	if err != nil { t.Fatal(err) }
	workspaceID := project.Workspaces[0].ID
	plan, err := reg.PreviewProvision(ctx, "owner-a", project.ID, workspaceID)
	if err != nil || plan.ExecutionAvailable || plan.Blocker != HostRunnerUnbound ||
		plan.WorkspaceState != NotProvisioned || plan.Profile != OfflinePythonProfile ||
		len(plan.PlanDigest) != 64 || plan.Intent != nil {
		t.Fatalf("preview must not claim execution authority: %#v err=%v", plan, err)
	}
	approved, err := reg.RequestProvision(ctx, "owner-a", project.ID, workspaceID, plan.PlanDigest)
	if err != nil || approved.Intent == nil || approved.Intent.State != AwaitingHostBinding ||
		approved.ExecutionAvailable {
		t.Fatalf("approval not persisted as blocked intent: %#v err=%v", approved, err)
	}
	firstID := approved.Intent.ID
	replayed, err := reg.RequestProvision(ctx, "owner-a", project.ID, workspaceID, plan.PlanDigest)
	if err != nil || replayed.Intent == nil || replayed.Intent.ID != firstID {
		t.Fatalf("lost-ack replay must return existing intent: %#v err=%v", replayed, err)
	}
	var count int64
	if err := db.Model(&ProvisionIntent{}).Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("replay created duplicate rows: count=%d err=%v", count, err)
	}
	detail, err := reg.Get(ctx, "owner-a", project.ID)
	if err != nil || len(detail.Workspaces) != 1 || detail.Workspaces[0].State != NotProvisioned {
		t.Fatalf("recording intent incorrectly provisioned workspace: %#v err=%v", detail, err)
	}
	sqlDB, err := db.DB()
	if err != nil { t.Fatal(err) }
	if err := sqlDB.Close(); err != nil { t.Fatal(err) }
	again := New(registryTestDB(t, path))
	persisted, err := again.PreviewProvision(ctx, "owner-a", project.ID, workspaceID)
	if err != nil || persisted.Intent == nil || persisted.Intent.ID != firstID ||
		persisted.Intent.State != AwaitingHostBinding || persisted.ExecutionAvailable {
		t.Fatalf("reopened SQLite lost blocked request: %#v err=%v", persisted, err)
	}
}

func TestProvisionIntentRejectsForeignScopeStaleDigestAndOtherWorkspace(t *testing.T) {
	db := registryTestDB(t, filepath.Join(t.TempDir(), "core.db"))
	r := New(db)
	ctx := context.Background()
	one, err := r.Create(ctx, "owner-a", "first", "manual")
	if err != nil { t.Fatal(err) }
	two, err := r.Create(ctx, "owner-b", "second", "catalog")
	if err != nil { t.Fatal(err) }
	ws := one.Workspaces[0].ID
	p, err := r.PreviewProvision(ctx, "owner-a", one.ID, ws)
	if err != nil { t.Fatal(err) }
	for _, tc := range []struct{ owner, project, workspace string }{
		{"owner-a", two.ID, two.Workspaces[0].ID},
		{"owner-a", one.ID, two.Workspaces[0].ID},
		{"owner-b", one.ID, ws},
		{"owner-a", "bad-id", ws},
		{"owner-a", one.ID, "bad-id"},
	} {
		if _, err := r.PreviewProvision(ctx, tc.owner, tc.project, tc.workspace); !errors.Is(err, ErrNotFound) {
			t.Fatalf("foreign/invalid preview disclosed scope: %+v err=%v", tc, err)
		}
		if _, err := r.RequestProvision(ctx, tc.owner, tc.project, tc.workspace, p.PlanDigest); !errors.Is(err, ErrNotFound) {
			t.Fatalf("foreign request accepted: %+v err=%v", tc, err)
		}
	}
	if _, err := r.RequestProvision(ctx, "owner-a", one.ID, ws, "0"); !errors.Is(err, ErrPlanChanged) {
		t.Fatalf("short digest unexpectedly accepted: %v", err)
	}
	if _, err := r.RequestProvision(ctx, "owner-a", one.ID, ws, "0"+"123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"); !errors.Is(err, ErrPlanChanged) {
		t.Fatalf("stale digest unexpectedly accepted: %v", err)
	}
	var count int64
	if err := db.Model(&ProvisionIntent{}).Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("denied intents mutated SQLite: %d %v", count, err)
	}
}

func TestProvisionIntentCannotReplaceAProvisionedWorkspace(t *testing.T) {
	db := registryTestDB(t, filepath.Join(t.TempDir(), "core.db"))
	r := New(db)
	p, err := r.Create(context.Background(), "owner-a", "demo", "uv")
	if err != nil { t.Fatal(err) }
	id := p.Workspaces[0].ID
	if err := db.Model(&Workspace{}).Where("id = ?", id).Update("state", "Provisioned").Error; err != nil { t.Fatal(err) }
	if _, err := r.PreviewProvision(context.Background(), "owner-a", p.ID, id); !errors.Is(err, ErrConflict) {
		t.Fatalf("provisioned workspace was approved again: %v", err)
	}
	if _, err := r.RequestProvision(context.Background(), "owner-a", p.ID, id, digestForPlan(p.ID, id)); !errors.Is(err, ErrConflict) {
		t.Fatalf("existing workspace got another provisioning intent: %v", err)
	}
}
