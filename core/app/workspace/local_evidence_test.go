package workspace

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"testing"
)

func TestLocalEvidenceDurableReplayAndForeignScope(t *testing.T) {
	ctx := context.Background()
	path := filepath.Join(t.TempDir(), "core.db")
	db := registryTestDB(t, path)
	r := New(db)
	a, err := r.Create(ctx, "owner-a", "local", "uv")
	if err != nil { t.Fatal(err) }
	b, err := r.Create(ctx, "owner-b", "secret", "manual")
	if err != nil { t.Fatal(err) }
	ws := a.Workspaces[0].ID
	if _, err := r.GetLocalEvidence(ctx, "owner-a", a.ID, ws); !errors.Is(err, ErrConflict) {
		t.Fatalf("no intent should prevent evidence: %v", err)
	}
	p, err := r.PreviewProvision(ctx, "owner-a", a.ID, ws)
	if err != nil { t.Fatal(err) }
	ap, err := r.RequestProvision(ctx, "owner-a", a.ID, ws, p.PlanDigest)
	if err != nil { t.Fatal(err) }
	in := LocalEvidenceInput{IntentID: ap.Intent.ID, PlanDigest: p.PlanDigest, ReceiptDigest: strings.Repeat("a", 64)}
	in.EvidenceDigest = evidenceDigest(in.IntentID, in.PlanDigest, in.ReceiptDigest)
	empty, err := r.GetLocalEvidence(ctx, "owner-a", a.ID, ws)
	if err != nil || empty.Evidence != nil || empty.TrustState != NoObservation || empty.Attested {
		t.Fatalf("absence cannot masquerade as provenance: %#v err=%v", empty, err)
	}
	one, err := r.ReportLocalEvidence(ctx, "owner-a", a.ID, ws, in)
	if err != nil || one.Evidence == nil || one.TrustState != OperatorReported ||
		one.Attested || one.WorkspaceState != NotProvisioned || one.Blocker != HostAttestationRequired {
		t.Fatalf("operator evidence claimed independent attestation: %#v err=%v", one, err)
	}
	replay, err := r.ReportLocalEvidence(ctx, "owner-a", a.ID, ws, in)
	if err != nil || replay.Evidence == nil || replay.Evidence.ID != one.Evidence.ID {
		t.Fatalf("lost ACK created duplicate: %#v err=%v", replay, err)
	}
	bad := in
	bad.ReceiptDigest = strings.Repeat("b", 64)
	bad.EvidenceDigest = evidenceDigest(bad.IntentID, bad.PlanDigest, bad.ReceiptDigest)
	if _, err := r.ReportLocalEvidence(ctx, "owner-a", a.ID, ws, bad); !errors.Is(err, ErrConflict) {
		t.Fatalf("conflicting receipt replaced immutable report: %v", err)
	}
	bad = in
	bad.EvidenceDigest = strings.Repeat("0", 64)
	if _, err := r.ReportLocalEvidence(ctx, "owner-a", a.ID, ws, bad); !errors.Is(err, ErrPlanChanged) {
		t.Fatalf("invalid claim digest accepted: %v", err)
	}
	for _, ref := range []struct{ owner, project, workspace string }{
		{"owner-b", a.ID, ws},
		{"owner-a", b.ID, b.Workspaces[0].ID},
		{"owner-a", a.ID, b.Workspaces[0].ID},
		{"owner-a", "bad-uuid", ws},
	} {
		if _, err := r.ReportLocalEvidence(ctx, ref.owner, ref.project, ref.workspace, in); !errors.Is(err, ErrNotFound) {
			t.Fatalf("cross-scope mutation did not fail closed: %+v %v", ref, err)
		}
		if _, err := r.GetLocalEvidence(ctx, ref.owner, ref.project, ref.workspace); !errors.Is(err, ErrNotFound) {
			t.Fatalf("cross-scope read did not fail closed: %+v %v", ref, err)
		}
	}
	var count int64
	if err := db.Model(&LocalEvidence{}).Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("evidence mutation count=%d err=%v", count, err)
	}
	detail, err := r.Get(ctx, "owner-a", a.ID)
	if err != nil || detail.Workspaces[0].State != NotProvisioned {
		t.Fatalf("untrusted report changed Workspace: %#v err=%v", detail, err)
	}
	sqlDB, err := db.DB()
	if err != nil { t.Fatal(err) }
	if err := sqlDB.Close(); err != nil { t.Fatal(err) }
	reopened := New(registryTestDB(t, path))
	got, err := reopened.GetLocalEvidence(ctx, "owner-a", a.ID, ws)
	if err != nil || got.Evidence == nil || got.Evidence.ID != one.Evidence.ID || got.Attested {
		t.Fatalf("SQLite restart lost untrusted evidence: %#v %v", got, err)
	}
}
