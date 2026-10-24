package lifecycle

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"sync"
	"testing"
)

const testArtifact = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const testEvidence = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

func openTestStore(t *testing.T) (*Store, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "journal.db")
	store, err := Open(path)
	if err != nil { t.Fatalf("open store: %v", err) }
	t.Cleanup(func(){ _ = store.Close() })
	return store, path
}

func validClaim(key string) ClaimRequest {
	return ClaimRequest{
		Owner: "session-user:123", Target: "/opt/gpupanel", Kind: KindUpgrade,
		IdempotencyKey: key, Binding: []byte(`{"version":"v2.4.0","mode":"stable"}`),
		ArtifactSHA256: testArtifact,
	}
}

func advance(t *testing.T, store *Store, op Operation, to State, stage, code, evidence string) Operation {
	t.Helper()
	next, replayed, err := store.Advance(context.Background(), TransitionRequest{
		Owner: op.Owner, OperationID: op.ID, ExpectedState: op.State,
		ExpectedRevision: op.Revision, NextState: to, Actor: op.Owner,
		Stage: stage, ErrorCode: code, EvidenceSHA256: evidence,
	})
	if err != nil { t.Fatalf("%s -> %s: %v", op.State, to, err) }
	if replayed { t.Fatalf("new transition %s -> %s unexpectedly reported replay", op.State, to) }
	if next.State != to || next.Revision != op.Revision+1 {
		t.Fatalf("transition result = %s/rev%d, want %s/rev%d", next.State, next.Revision, to, op.Revision+1)
	}
	return next
}

func TestClaimIdentityAndOutcomeSurviveStoreRestart(t *testing.T) {
	store, path := openTestStore(t)
	first, created, err := store.Claim(context.Background(), validClaim("upgrade-2026-01"))
	if err != nil { t.Fatal(err) }
	if !created || first.ID == "" || first.State != StatePlanned || first.Revision != 1 {
		t.Fatalf("unexpected first claim: %#v created=%v", first, created)
	}
	first = advance(t, store, first, StatePreflight, "read_only_preflight_passed", "", "")
	first = advance(t, store, first, StatePlanReviewed, "operator_plan_reviewed", "", "")
	first = advance(t, store, first, StateApplying, "candidate_activation_started", "", "")
	first = advance(t, store, first, StateUnknown, "worker_interrupted", "process_interrupted", "")
	if err := store.Close(); err != nil { t.Fatal(err) }

	reopened, err := Open(path)
	if err != nil { t.Fatal(err) }
	defer reopened.Close()
	replayed, created, err := reopened.Claim(context.Background(), validClaim("upgrade-2026-01"))
	if err != nil { t.Fatal(err) }
	if created { t.Fatal("restart re-opened an existing operation as new work") }
	if replayed.ID != first.ID || replayed.State != StateUnknown || replayed.Revision != first.Revision {
		t.Fatalf("restart changed operation identity/outcome: got %#v want %#v", replayed, first)
	}
	events, err := reopened.History(context.Background(), replayed.Owner, replayed.ID)
	if err != nil { t.Fatal(err) }
	if len(events) != 5 || events[len(events)-1].ToState != StateUnknown {
		t.Fatalf("durable history lost: %#v", events)
	}
}

func TestClaimChangedBindingIsRejected(t *testing.T) {
	store, _ := openTestStore(t)
	first, created, err := store.Claim(context.Background(), validClaim("same-key"))
	if err != nil || !created { t.Fatalf("first claim: created=%v err=%v", created, err) }
	changed := validClaim("same-key")
	changed.Binding = []byte(`{"version":"attacker-supplied-different-version"}`)
	if _, _, err := store.Claim(context.Background(), changed); !errors.Is(err, ErrBindingMismatch) {
		t.Fatalf("binding change was not rejected: %v", err)
	}
	changed = validClaim("same-key")
	changed.ArtifactSHA256 = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
	if _, _, err := store.Claim(context.Background(), changed); !errors.Is(err, ErrBindingMismatch) {
		t.Fatalf("artifact change was not rejected: %v", err)
	}
	if first.State != StatePlanned { t.Fatal("mismatch mutated the original operation") }
}

func TestConcurrentClaimsCreateExactlyOneOperation(t *testing.T) {
	store, _ := openTestStore(t)
	const workers = 32
	var wg sync.WaitGroup
	var mu sync.Mutex
	createdCount := 0
	ids := make(map[string]int)
	errs := make([]error, 0)
	for i:=0; i<workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			op, created, err := store.Claim(context.Background(), validClaim("concurrent-upgrade"))
			mu.Lock()
			defer mu.Unlock()
			if err != nil { errs = append(errs, err); return }
			if created { createdCount++ }
			ids[op.ID]++
		}()
	}
	wg.Wait()
	if len(errs) != 0 { t.Fatalf("claim errors: %v", errs) }
	if createdCount != 1 || len(ids) != 1 {
		t.Fatalf("created=%d unique IDs=%d observations=%v", createdCount, len(ids), ids)
	}
}

func TestRevisionCASTransitionReplayAndTerminalEvidence(t *testing.T) {
	store, _ := openTestStore(t)
	op, _, err := store.Claim(context.Background(), validClaim("lifecycle-success"))
	if err != nil { t.Fatal(err) }
	preflightReq := TransitionRequest{
		Owner:op.Owner, OperationID:op.ID, ExpectedState:StatePlanned,
		ExpectedRevision:op.Revision, NextState:StatePreflight, Actor:op.Owner,
		Stage:"preflight_passed",
	}
	after, replay, err := store.Advance(context.Background(), preflightReq)
	if err != nil || replay { t.Fatalf("advance: replay=%v err=%v", replay, err) }
	again, replay, err := store.Advance(context.Background(), preflightReq)
	if err != nil || !replay || again.ID != after.ID || again.Revision != after.Revision {
		t.Fatalf("identical transition was not idempotent: replay=%v op=%#v err=%v", replay, again, err)
	}
	stale := preflightReq
	stale.NextState = StateFailedNoMutation
	stale.ErrorCode = "stale-caller"
	if _, _, err := store.Advance(context.Background(), stale); !errors.Is(err, ErrRevisionConflict) {
		t.Fatalf("stale revision overwrote transition: %v", err)
	}
	op = advance(t, store, after, StatePlanReviewed, "plan_reviewed", "", "")
	op = advance(t, store, op, StateBackupSealed, "backup_sealed", "", testEvidence)
	op = advance(t, store, op, StateApplying, "applying", "", "")
	op = advance(t, store, op, StateVerifying, "verifying", "", "")
	if _, _, err := store.Advance(context.Background(), TransitionRequest{
		Owner:op.Owner, OperationID:op.ID, ExpectedState:op.State,
		ExpectedRevision:op.Revision, NextState:StateCompleted, Actor:op.Owner,
	}); !errors.Is(err, ErrInvalidRequest) {
		t.Fatalf("completed without evidence was accepted: %v", err)
	}
	op = advance(t, store, op, StateCompleted, "health_verified", "", testEvidence)
	events, err := store.History(context.Background(), op.Owner, op.ID)
	if err != nil { t.Fatal(err) }
	if len(events) != int(op.Revision) { t.Fatalf("events=%d, revision=%d", len(events), op.Revision) }
	for idx, event := range events {
		if event.Sequence != uint64(idx+1) { t.Fatalf("event order broken at %d: %#v", idx, event) }
	}
}

func TestUnknownCannotTransitionExceptEvidenceBackedReconciliation(t *testing.T) {
	store, _ := openTestStore(t)
	op, _, err := store.Claim(context.Background(), validClaim("interrupted-upgrade"))
	if err != nil { t.Fatal(err) }
	op = advance(t, store, op, StatePreflight, "preflight", "", "")
	op = advance(t, store, op, StatePlanReviewed, "reviewed", "", "")
	op = advance(t, store, op, StateApplying, "mutating", "", "")
	op = advance(t, store, op, StateUnknown, "worker_lost", "worker_lost", "")
	if _, _, err := store.Advance(context.Background(), TransitionRequest{
		Owner:op.Owner, OperationID:op.ID, ExpectedState:StateUnknown,
		ExpectedRevision:op.Revision, NextState:StateApplying, Actor:op.Owner,
	}); !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("UNKNOWN was re-opened without reconciliation: %v", err)
	}
	if _, err := store.Reconcile(context.Background(), ReconcileRequest{
		Owner:op.Owner, OperationID:op.ID, ExpectedState:StateUnknown,
		ExpectedRevision:op.Revision, NextState:StateCompleted, Actor:"operator:alice",
	}); !errors.Is(err, ErrInvalidRequest) {
		t.Fatalf("reconciliation without evidence accepted: %v", err)
	}
	reconciled, err := store.Reconcile(context.Background(), ReconcileRequest{
		Owner:op.Owner, OperationID:op.ID, ExpectedState:StateUnknown,
		ExpectedRevision:op.Revision, NextState:StateRolledBack, Actor:"operator:alice",
		EvidenceSHA256:testEvidence,
	})
	if err != nil { t.Fatal(err) }
	if reconciled.State != StateRolledBack || reconciled.Revision != op.Revision+1 {
		t.Fatalf("bad reconciliation result: %#v", reconciled)
	}
	replayed, created, err := store.Claim(context.Background(), validClaim("interrupted-upgrade"))
	if err != nil || created || replayed.ID != op.ID || replayed.State != StateRolledBack {
		t.Fatalf("replay did not retain reconciled outcome: %#v created=%v err=%v", replayed, created, err)
	}
}

func TestOwnerAndTargetValidationFailClosed(t *testing.T) {
	store, _ := openTestStore(t)
	req := validClaim("bad-owner")
	req.Owner = ""
	if _, _, err := store.Claim(context.Background(), req); !errors.Is(err, ErrInvalidRequest) {
		t.Fatalf("empty owner accepted: %v", err)
	}
	req = validClaim("relative-target")
	req.Target = "opt/gpupanel"
	if _, _, err := store.Claim(context.Background(), req); !errors.Is(err, ErrInvalidRequest) {
		t.Fatalf("relative target accepted: %v", err)
	}
	op, _, err := store.Claim(context.Background(), validClaim("owner-scope"))
	if err != nil { t.Fatal(err) }
	if _, err := store.Get(context.Background(), "other-principal", op.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("foreign principal learned or mutated another operation: %v", err)
	}
}

func TestDefaultJournalIsNotProductDataDirectory(t *testing.T) {
	if DefaultDatabase == filepath.Join("/opt/gpupanel", "db", "core.db") {
		t.Fatal("lifecycle history must survive product DB restore and purge")
	}
	if !filepath.IsAbs(DefaultDatabase) { t.Fatal("default journal path must be absolute") }
	if fmt.Sprintf("%s", KindInstall) != "install" { t.Fatal("kind serialization changed") }
}
