// SPDX-License-Identifier: Apache-2.0

package operation

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestClaimCreatesPlannedAndReplays(t *testing.T) {
	s, _ := newTestStore(t, 4)
	req := claimReq("alice", "host://node-1", "restart-1", []byte(`{"image":"nvidia/cuda"}`))

	first, replayed, err := s.Claim(context.Background(), req)
	if err != nil {
		t.Fatalf("Claim: %v", err)
	}
	if replayed {
		t.Fatal("first claim must not be a replay")
	}
	if first.State != StatePlanned {
		t.Fatalf("state = %s, want planned", first.State)
	}
	if !strings.HasPrefix(first.ID, "op_") {
		t.Fatalf("id %q lacks op_ identity prefix", first.ID)
	}
	wantDigest := sha256.Sum256(req.Params)
	if first.ParamsDigest != hex.EncodeToString(wantDigest[:]) {
		t.Fatalf("digest = %s, want %s", first.ParamsDigest, hex.EncodeToString(wantDigest[:]))
	}
	if first.StartedAt != (time.Time{}) || first.EndedAt != (time.Time{}) {
		t.Fatalf("planned record has start/end timestamps: %+v", first)
	}
	if !first.ExpiresAt.Equal(first.CreatedAt.Add(testTTL)) {
		t.Fatalf("expiry = %s, want created+%s", first.ExpiresAt, testTTL)
	}

	second, replayed, err := s.Claim(context.Background(), req)
	if err != nil {
		t.Fatalf("replay Claim: %v", err)
	}
	if !replayed {
		t.Fatal("identical claim must replay")
	}
	if second.ID != first.ID {
		t.Fatalf("replay returned identity %s, want %s", second.ID, first.ID)
	}
}

func TestClaimDigestMismatchRejected(t *testing.T) {
	s, _ := newTestStore(t, 4)
	base := claimReq("alice", "host://node-1", "job", []byte("a=1"))
	op := mustClaim(t, s, base)

	changed := base
	changed.Params = []byte("a=2")
	_, _, err := s.Claim(context.Background(), changed)
	if !errors.Is(err, ErrDigestMismatch) {
		t.Fatalf("changed params error = %v, want ErrDigestMismatch", err)
	}
	got := mustGet(t, s, "alice", op.ID)
	if got.ParamsDigest != op.ParamsDigest {
		t.Fatalf("digest changed on rejected claim: %s vs %s", got.ParamsDigest, op.ParamsDigest)
	}
}

func TestClaimResourceBindingMismatchRejected(t *testing.T) {
	s, _ := newTestStore(t, 4)
	base := claimReq("alice", "host://node-1", "job", []byte("a=1"))
	op := mustClaim(t, s, base)

	rebound := base
	rebound.Resource = "host://node-2"
	_, _, err := s.Claim(context.Background(), rebound)
	if !errors.Is(err, ErrBindingMismatch) {
		t.Fatalf("rebound claim error = %v, want ErrBindingMismatch", err)
	}
	// The digest alone must not substitute for the resource binding check.
	sameDigestDifferentKey := base
	sameDigestDifferentKey.Key = "other-job"
	sameDigestDifferentKey.Resource = "host://node-2"
	if _, _, err := s.Claim(context.Background(), sameDigestDifferentKey); err != nil {
		t.Fatalf("fresh identity on another resource must be allowed: %v", err)
	}
	got := mustGet(t, s, "alice", op.ID)
	if got.Resource != "host://node-1" {
		t.Fatalf("resource mutated to %q", got.Resource)
	}
}

func TestClaimKeyScopedPerOwner(t *testing.T) {
	s, _ := newTestStore(t, 4)
	alice := mustClaim(t, s, claimReq("alice", "host://node-1", "shared-key", []byte("p")))

	bobOp, replayed, err := s.Claim(context.Background(), claimReq("bob", "host://node-1", "shared-key", []byte("p")))
	if err != nil {
		t.Fatalf("bob claim: %v", err)
	}
	if replayed {
		t.Fatal("a different owner must never replay another owner's identity")
	}
	if bobOp.ID == alice.ID {
		t.Fatalf("owners share identity %s", alice.ID)
	}
	if _, err := s.Get(context.Background(), "bob", alice.ID); !errors.Is(err, ErrOwnershipDenied) {
		t.Fatalf("bob reading alice's record: %v, want ErrOwnershipDenied", err)
	}
}

func TestForeignOwnerMutationsDenied(t *testing.T) {
	s, _ := newTestStore(t, 4)
	op := mustClaim(t, s, claimReq("alice", "host://node-1", "job", []byte("p")))
	ctx := context.Background()

	steps := map[string]func() error{
		"get":      func() error { _, err := s.Get(ctx, "bob", op.ID); return err },
		"begin":    func() error { _, _, err := s.Begin(ctx, "bob", op.ID); return err },
		"complete": func() error { _, err := s.Complete(ctx, "bob", op.ID); return err },
		"fail":     func() error { _, err := s.Fail(ctx, "bob", op.ID); return err },
		"verify": func() error {
			_, err := s.Verify(ctx, "bob", op.ID, Verification{Source: "exit-code", Result: ResultSucceeded})
			return err
		},
	}
	for name, run := range steps {
		if err := run(); !errors.Is(err, ErrOwnershipDenied) {
			t.Fatalf("%s by foreign owner: %v, want ErrOwnershipDenied", name, err)
		}
	}
	if got := mustGet(t, s, "alice", op.ID); got.State != StatePlanned {
		t.Fatalf("foreign attempts mutated state to %s", got.State)
	}
}

func TestReconcileScopedToOwnerLeavesForeignRecords(t *testing.T) {
	s, clk := newTestStore(t, 4)
	ctx := context.Background()
	alice := mustClaim(t, s, claimReq("alice", "host://n", "job", []byte("p")))
	bob := mustClaim(t, s, claimReq("bob", "host://n", "job", []byte("p")))

	report, err := s.Reconcile(ctx, "carol")
	if err != nil {
		t.Fatalf("Reconcile(carol): %v", err)
	}
	if len(report.TimedOut) != 0 || len(report.Purged) != 0 {
		t.Fatalf("foreign reconcile changed records: %+v", report)
	}

	clk.Advance(testTTL + time.Second)
	bobReport, err := s.Reconcile(ctx, "bob")
	if err != nil {
		t.Fatalf("Reconcile(bob): %v", err)
	}
	if len(bobReport.Purged) != 1 || bobReport.Purged[0] != bob.ID {
		t.Fatalf("bob's own expired record not purged: %+v", bobReport)
	}
	// Alice's expired record is still physically present: a foreign reconcile
	// must not reclaim it (ErrExpired, not ErrNotFound).
	if _, err := s.Get(ctx, "alice", alice.ID); !errors.Is(err, ErrExpired) {
		t.Fatalf("alice's record after bob's reconcile: %v, want ErrExpired", err)
	}

	aliceReport, err := s.Reconcile(ctx, "alice")
	if err != nil {
		t.Fatalf("Reconcile(alice): %v", err)
	}
	if len(aliceReport.Purged) != 1 || aliceReport.Purged[0] != alice.ID {
		t.Fatalf("alice's expired record not purged: %+v", aliceReport)
	}
	if _, err := s.Get(ctx, "alice", alice.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("purged record still readable: %v", err)
	}
}

func TestUnknownIDAndEmptyOwnerRejected(t *testing.T) {
	s, _ := newTestStore(t, 4)
	if _, err := s.Get(context.Background(), "alice", "op_missing"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown id: %v, want ErrNotFound", err)
	}
	if _, _, err := s.Claim(context.Background(), claimReq("", "host://n", "k", nil)); !errors.Is(err, ErrInvalidRequest) {
		t.Fatalf("empty owner: %v, want ErrInvalidRequest", err)
	}
	if _, err := s.Reconcile(context.Background(), ""); !errors.Is(err, ErrInvalidRequest) {
		t.Fatalf("empty reconcile owner: %v, want ErrInvalidRequest", err)
	}
	// Queries are read-only: a denied lookup must not create anything.
	if _, err := s.List(context.Background(), "alice"); err != nil {
		t.Fatalf("List: %v", err)
	}
}

func TestClaimValidationBounds(t *testing.T) {
	s, _ := newTestStore(t, 4)
	ctx := context.Background()
	cases := map[string]ClaimRequest{
		"empty key":               claimReq("alice", "host://n", "", nil),
		"empty resource":          claimReq("alice", "", "k", nil),
		"oversized owner":         claimReq(Owner(strings.Repeat("o", MaxOwnerBytes+1)), "host://n", "k", nil),
		"oversized key":           claimReq("alice", "host://n", strings.Repeat("k", MaxKeyBytes+1), nil),
		"oversized res":           claimReq("alice", strings.Repeat("r", MaxResourceBytes+1), "k", nil),
		"oversized params":        claimReq("alice", "host://n", "k", make([]byte, MaxParamsBytes+1)),
		"unicode over byte bound": claimReq("alice", "host://n", strings.Repeat("é", MaxKeyBytes), nil),
	}
	for name, req := range cases {
		if _, _, err := s.Claim(ctx, req); !errors.Is(err, ErrInvalidRequest) {
			t.Fatalf("%s: %v, want ErrInvalidRequest", name, err)
		}
	}
	if got, err := s.List(ctx, "alice"); err != nil || len(got) != 0 {
		t.Fatalf("rejected claims created %d records (err=%v)", len(got), err)
	}
}

func TestConfigRejectsMissingOrIncoherentBounds(t *testing.T) {
	base := Config{Capacity: 4, RecordTTL: testTTL, RunningTimeout: testTimeout}
	cases := map[string]Config{
		"zero capacity":     {Capacity: 0, RecordTTL: testTTL, RunningTimeout: testTimeout},
		"negative ttl":      {Capacity: 4, RecordTTL: -time.Second, RunningTimeout: testTimeout},
		"zero timeout":      {Capacity: 4, RecordTTL: testTTL, RunningTimeout: 0},
		"ttl below timeout": {Capacity: 4, RecordTTL: testTimeout, RunningTimeout: testTimeout},
	}
	for name, cfg := range cases {
		if _, err := New(cfg); !errors.Is(err, ErrInvalidConfig) {
			t.Fatalf("%s: %v, want ErrInvalidConfig", name, err)
		}
	}
	if _, err := New(base); err != nil {
		t.Fatalf("valid config rejected: %v", err)
	}
	// Default clock path must not panic.
	if _, err := New(Config{Capacity: 1, RecordTTL: time.Minute, RunningTimeout: time.Second}); err != nil {
		t.Fatalf("system-clock config: %v", err)
	}
}

func TestCapacityRejectsWithoutEviction(t *testing.T) {
	s, clk := newTestStore(t, 2)
	a := mustClaim(t, s, claimReq("alice", "host://n", "k1", []byte("1")))
	b := mustClaim(t, s, claimReq("alice", "host://n", "k2", []byte("2")))

	_, _, err := s.Claim(context.Background(), claimReq("alice", "host://n", "k3", []byte("3")))
	if !errors.Is(err, ErrCapacity) {
		t.Fatalf("overflow claim: %v, want ErrCapacity", err)
	}
	// No hidden eviction: both earlier records are intact.
	if got := mustGet(t, s, "alice", a.ID); got.ID != a.ID || got.State != StatePlanned {
		t.Fatalf("record a lost after capacity rejection: %+v", got)
	}
	if got := mustGet(t, s, "alice", b.ID); got.ID != b.ID {
		t.Fatalf("record b lost after capacity rejection: %+v", got)
	}

	// The rejected claim left no partial identity behind: once capacity is
	// reclaimed explicitly, the same key claims cleanly (a dangling key would
	// replay a dead identity or panic here instead).
	clk.Advance(testTTL + time.Second)
	report, err := s.Reconcile(context.Background(), "alice")
	if err != nil || len(report.Purged) != 2 {
		t.Fatalf("reclaim: report=%+v err=%v", report, err)
	}
	if _, replayed, err := s.Claim(context.Background(), claimReq("alice", "host://n", "k3", []byte("3"))); err != nil || replayed {
		t.Fatalf("rejected key after reclaim: err=%v replayed=%t, want fresh claim", err, replayed)
	}
}

func TestLifecycleHappyPathAndBeginReplay(t *testing.T) {
	s, clk := newTestStore(t, 4)
	op := mustClaim(t, s, claimReq("alice", "host://n", "job", []byte("p")))

	running, transitioned, err := s.Begin(context.Background(), "alice", op.ID)
	if err != nil {
		t.Fatalf("Begin: %v", err)
	}
	if !transitioned || running.State != StateRunning {
		t.Fatalf("begin result: transitioned=%t state=%s", transitioned, running.State)
	}
	if !running.Deadline.Equal(running.StartedAt.Add(testTimeout)) {
		t.Fatalf("deadline = %s, want start+%s", running.Deadline, testTimeout)
	}

	clk.Advance(time.Second)
	again, transitioned, err := s.Begin(context.Background(), "alice", op.ID)
	if err != nil {
		t.Fatalf("replayed Begin: %v", err)
	}
	if transitioned {
		t.Fatal("second Begin must not transition again")
	}
	if !again.StartedAt.Equal(running.StartedAt) {
		t.Fatalf("replayed Begin moved StartedAt: %s vs %s", again.StartedAt, running.StartedAt)
	}

	done, err := s.Complete(context.Background(), "alice", op.ID)
	if err != nil {
		t.Fatalf("Complete: %v", err)
	}
	if done.State != StateCompleted || done.EndedAt.IsZero() {
		t.Fatalf("completed record: %+v", done)
	}
	if done.State.Result() != ResultSucceeded {
		t.Fatalf("completed result = %s", done.State.Result())
	}
}

func TestInvalidTransitionsRejected(t *testing.T) {
	s, _ := newTestStore(t, 4)
	ctx := context.Background()
	planned := mustClaim(t, s, claimReq("alice", "host://n", "k1", nil))
	if _, err := s.Complete(ctx, "alice", planned.ID); !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("Complete on planned: %v", err)
	}
	if _, err := s.Fail(ctx, "alice", planned.ID); !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("Fail on planned: %v", err)
	}

	running := mustClaim(t, s, claimReq("alice", "host://n", "k2", nil))
	mustBegin(t, s, "alice", running.ID)
	if _, err := s.Complete(ctx, "alice", running.ID); err != nil {
		t.Fatalf("Complete on running: %v", err)
	}
	if _, err := s.Complete(ctx, "alice", running.ID); !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("duplicate Complete: %v, want ErrInvalidTransition", err)
	}
	if _, err := s.Fail(ctx, "alice", running.ID); !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("Fail after Complete: %v", err)
	}
	if _, _, err := s.Begin(ctx, "alice", running.ID); !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("Begin after Complete: %v", err)
	}
}

func TestListScopedSortedAndReadOnly(t *testing.T) {
	s, _ := newTestStore(t, 8)
	ctx := context.Background()
	a1 := mustClaim(t, s, claimReq("alice", "host://n", "k1", nil))
	a2 := mustClaim(t, s, claimReq("alice", "host://n", "k2", nil))
	mustClaim(t, s, claimReq("bob", "host://n", "k3", nil))

	got, err := s.List(ctx, "alice")
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(got) != 2 || got[0].ID != a1.ID || got[1].ID != a2.ID {
		t.Fatalf("List = %v, want [%s %s]", idsOf(got), a1.ID, a2.ID)
	}
	// Read-only: listing must not transition anything.
	for _, op := range got {
		if op.State != StatePlanned {
			t.Fatalf("List mutated state: %+v", op)
		}
	}

	bob, err := s.List(ctx, "bob")
	if err != nil || len(bob) != 1 || bob[0].Key != "k3" {
		t.Fatalf("List(bob) = %v err=%v, want exactly bob's record", idsOf(bob), err)
	}
}

func TestSnapshotsDoNotAliasStoreState(t *testing.T) {
	s, _ := newTestStore(t, 4)
	op := mustClaim(t, s, claimReq("alice", "host://n", "k", []byte("p")))
	mustBegin(t, s, "alice", op.ID)
	if _, err := s.Complete(context.Background(), "alice", op.ID); err != nil {
		t.Fatalf("Complete: %v", err)
	}
	verified, err := s.Verify(context.Background(), "alice", op.ID,
		Verification{Source: "exit-code", Result: ResultSucceeded, Evidence: "receipt/1"})
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if !verified.IndependentlyVerified() {
		t.Fatalf("agreed verification not reflected: %+v", verified)
	}

	// Mutating returned values must not reach the store.
	verified.State = StateFailed
	verified.Verification.Source = "tampered"
	verified.Verification.Evidence = "tampered"

	fresh := mustGet(t, s, "alice", op.ID)
	if fresh.State != StateCompleted {
		t.Fatalf("store state mutated through snapshot: %s", fresh.State)
	}
	if fresh.Verification.Source != "exit-code" || fresh.Verification.Evidence != "receipt/1" {
		t.Fatalf("store verification mutated through snapshot: %+v", *fresh.Verification)
	}
}

func TestContextCancellationHonouredBeforeMutation(t *testing.T) {
	s, clk := newTestStore(t, 4)
	op := mustClaim(t, s, claimReq("alice", "host://n", "k", nil))

	cancelled, cancel := context.WithCancel(context.Background())
	cancel()

	if _, _, err := s.Claim(cancelled, claimReq("alice", "host://n", "k2", nil)); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled Claim: %v", err)
	}
	if _, err := s.Get(cancelled, "alice", op.ID); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled Get: %v", err)
	}
	if _, _, err := s.Begin(cancelled, "alice", op.ID); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled Begin: %v", err)
	}
	if _, err := s.Reconcile(cancelled, "alice"); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled Reconcile: %v", err)
	}
	// The cancelled Begin must not have armed anything.
	clk.Advance(testTimeout * 2)
	got := mustGet(t, s, "alice", op.ID)
	if got.State != StatePlanned || !got.StartedAt.IsZero() {
		t.Fatalf("cancelled Begin mutated record: %+v", got)
	}
	// The rejected claim must not have consumed capacity.
	if _, _, err := s.Claim(context.Background(), claimReq("alice", "host://n", "k2", nil)); err != nil {
		t.Fatalf("capacity lost to cancelled claim: %v", err)
	}
}

// helpers for compact assertion output

func idsOf(ops []Operation) []string {
	out := make([]string, 0, len(ops))
	for _, op := range ops {
		out = append(out, op.ID)
	}
	return out
}
