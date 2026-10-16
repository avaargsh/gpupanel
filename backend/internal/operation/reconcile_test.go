// SPDX-License-Identifier: Apache-2.0

package operation

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestQueriesNeverReconcileTransitionOrExecute(t *testing.T) {
	s, clk := newTestStore(t, 4)
	ctx := context.Background()
	op := mustClaim(t, s, claimReq("alice", "host://n", "job", []byte("p")))
	mustBegin(t, s, "alice", op.ID)

	clk.Advance(testTimeout + time.Second) // past the running deadline

	for i := 0; i < 3; i++ {
		got := mustGet(t, s, "alice", op.ID)
		if got.State != StateRunning {
			t.Fatalf("Get #%d changed state to %s; queries must never reconcile", i, got.State)
		}
		list, err := s.List(ctx, "alice")
		if err != nil || len(list) != 1 || list[0].State != StateRunning {
			t.Fatalf("List #%d: %v err=%v", i, idsOf(list), err)
		}
	}

	// A query for a non-existent id must not create or replay anything.
	if _, err := s.Get(ctx, "alice", "op_ghost"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("ghost query: %v, want ErrNotFound", err)
	}
	if list, _ := s.List(ctx, "alice"); len(list) != 1 {
		t.Fatalf("queries changed record count to %d", len(list))
	}

	report, err := s.Reconcile(ctx, "alice")
	if err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	if len(report.TimedOut) != 1 || report.TimedOut[0] != op.ID || len(report.Purged) != 0 {
		t.Fatalf("reconcile report = %+v, want timed out [%s]", report, op.ID)
	}
	if got := mustGet(t, s, "alice", op.ID); got.State != StateUnknown {
		t.Fatalf("state after reconcile = %s, want unknown", got.State)
	}
}

func TestLateOutcomeAfterTimeoutRejected(t *testing.T) {
	s, clk := newTestStore(t, 4)
	ctx := context.Background()
	op := mustClaim(t, s, claimReq("alice", "host://n", "job", nil))
	mustBegin(t, s, "alice", op.ID)
	clk.Advance(testTimeout + time.Second)
	if _, err := s.Reconcile(ctx, "alice"); err != nil {
		t.Fatalf("Reconcile: %v", err)
	}

	if _, err := s.Complete(ctx, "alice", op.ID); !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("late Complete: %v, want ErrInvalidTransition", err)
	}
	if _, err := s.Fail(ctx, "alice", op.ID); !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("late Fail: %v, want ErrInvalidTransition", err)
	}
	if _, _, err := s.Begin(ctx, "alice", op.ID); !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("late Begin: %v, want ErrInvalidTransition", err)
	}
	got := mustGet(t, s, "alice", op.ID)
	if got.State != StateUnknown {
		t.Fatalf("late outcome mutated state to %s", got.State)
	}
	if got.EndedAt.IsZero() {
		t.Fatal("timeout transition left no ended-at timestamp")
	}
}

func TestExpiryDeniesReadsAndReplayUntilExplicitReclaim(t *testing.T) {
	s, clk := newTestStore(t, 1) // capacity one makes the retention trade visible
	ctx := context.Background()
	first := mustClaim(t, s, claimReq("alice", "host://n", "job", []byte("p")))

	clk.Advance(testTTL + time.Second)

	if _, err := s.Get(ctx, "alice", first.ID); !errors.Is(err, ErrExpired) {
		t.Fatalf("expired Get: %v, want ErrExpired", err)
	}
	if list, _ := s.List(ctx, "alice"); len(list) != 0 {
		t.Fatalf("expired record listed: %v", idsOf(list))
	}
	// Replaying an expired identity is explicitly rejected, not silently renewed.
	_, replayed, err := s.Claim(ctx, claimReq("alice", "host://n", "job", []byte("p")))
	if !errors.Is(err, ErrExpired) || replayed {
		t.Fatalf("expired replay: err=%v replayed=%t, want ErrExpired", err, replayed)
	}
	// The expired record still occupies capacity: no hidden eviction.
	if _, _, err := s.Claim(ctx, claimReq("alice", "host://n", "other", nil)); !errors.Is(err, ErrCapacity) {
		t.Fatalf("expired record must still occupy capacity: %v", err)
	}

	report, err := s.Reconcile(ctx, "alice")
	if err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	if len(report.Purged) != 1 || report.Purged[0] != first.ID {
		t.Fatalf("purge report = %+v, want [%s]", report, first.ID)
	}
	if _, err := s.Get(ctx, "alice", first.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("purged Get: %v, want ErrNotFound", err)
	}

	// After explicit purge the key and the capacity slot are released: the
	// reused key claims a fresh identity rather than resurrecting or replaying
	// the purged record.
	reused, replayed, err := s.Claim(ctx, claimReq("alice", "host://n", "job", []byte("p")))
	if err != nil || replayed {
		t.Fatalf("key reuse after purge: err=%v replayed=%t", err, replayed)
	}
	if reused.ID == first.ID {
		t.Fatalf("released key resurrected old identity %s", reused.ID)
	}
	if reused.State != StatePlanned {
		t.Fatalf("reused key state = %s, want planned", reused.State)
	}
}

func TestRunningRecordHeldUntilTimeoutThenPurgedNextCycle(t *testing.T) {
	s, clk := newTestStore(t, 4)
	ctx := context.Background()
	op := mustClaim(t, s, claimReq("alice", "host://n", "job", nil))

	clk.Advance(testTTL - 10*time.Second) // still inside TTL
	mustBegin(t, s, "alice", op.ID)       // deadline = created + TTL + 20s

	clk.Advance(15 * time.Second) // past record expiry, before running deadline
	report, err := s.Reconcile(ctx, "alice")
	if err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	if len(report.TimedOut) != 0 || len(report.Purged) != 0 {
		t.Fatalf("running record changed before its deadline: %+v", report)
	}
	if got := mustGet(t, s, "alice", op.ID); got.State != StateRunning {
		t.Fatalf("running record unreadable/state=%s", got.State)
	}

	clk.Advance(20 * time.Second) // past the running deadline
	report, err = s.Reconcile(ctx, "alice")
	if err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	if len(report.TimedOut) != 1 || report.TimedOut[0] != op.ID {
		t.Fatalf("timeout not applied: %+v", report)
	}
	if len(report.Purged) != 0 {
		t.Fatalf("record purged in the same cycle it became unknown: %+v", report)
	}
	// The unknown outcome stays queryable even though the record TTL elapsed
	// while it was running (explicit bounded observation window).
	if got := mustGet(t, s, "alice", op.ID); got.State != StateUnknown {
		t.Fatalf("unknown outcome hidden after TTL: %v", got.State)
	}

	clk.Advance(testWindow + time.Second) // past the observation window
	report, err = s.Reconcile(ctx, "alice")
	if err != nil {
		t.Fatalf("second Reconcile: %v", err)
	}
	if len(report.Purged) != 1 || report.Purged[0] != op.ID {
		t.Fatalf("unknown record not reclaimed after window: %+v", report)
	}
	if _, err := s.Get(ctx, "alice", op.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("purged record: %v", err)
	}
}

func TestVerifyRequiresTerminalState(t *testing.T) {
	s, _ := newTestStore(t, 4)
	ctx := context.Background()
	v := Verification{Source: "exit-code", Result: ResultSucceeded}

	op := mustClaim(t, s, claimReq("alice", "host://n", "job", nil))
	if _, err := s.Verify(ctx, "alice", op.ID, v); !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("Verify on planned: %v, want ErrInvalidTransition", err)
	}
	mustBegin(t, s, "alice", op.ID)
	if _, err := s.Verify(ctx, "alice", op.ID, v); !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("Verify on running: %v, want ErrInvalidTransition", err)
	}
	if _, err := s.Verify(ctx, "alice", "op_ghost", v); !errors.Is(err, ErrNotFound) {
		t.Fatalf("Verify on unknown id: %v", err)
	}
}

func TestVerifyAgreementAndDisagreementAreDistinct(t *testing.T) {
	s, clk := newTestStore(t, 4)
	ctx := context.Background()

	agree := mustClaim(t, s, claimReq("alice", "host://n", "k1", nil))
	mustBegin(t, s, "alice", agree.ID)
	if _, err := s.Complete(ctx, "alice", agree.ID); err != nil {
		t.Fatalf("Complete: %v", err)
	}
	got, err := s.Verify(ctx, "alice", agree.ID,
		Verification{Source: "exit-code", Result: ResultSucceeded, Evidence: "receipt/7"})
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if !got.IndependentlyVerified() {
		t.Fatalf("agreeing verification not confirmed: %+v", got)
	}
	if got.State != StateCompleted || got.Verification.Result != ResultSucceeded {
		t.Fatalf("state and outcome must stay two distinct facts: %+v", got)
	}

	// An operation reconciled to unknown keeps that state even when an
	// independent observer later reports success: the disagreement survives.
	disagree := mustClaim(t, s, claimReq("alice", "host://n", "k2", nil))
	mustBegin(t, s, "alice", disagree.ID)
	clk.Advance(testTimeout + time.Second)
	if _, err := s.Reconcile(ctx, "alice"); err != nil {
		t.Fatalf("Reconcile: %v", err)
	}
	got, err = s.Verify(ctx, "alice", disagree.ID,
		Verification{Source: "docker-inspect", Result: ResultSucceeded, Evidence: "inspect/1"})
	if err != nil {
		t.Fatalf("Verify unknown: %v", err)
	}
	if got.State != StateUnknown {
		t.Fatalf("verification rewrote state to %s", got.State)
	}
	if got.IndependentlyVerified() {
		t.Fatal("disagreement must not read as independently verified")
	}
	if got.Verification == nil || got.Verification.Result != ResultSucceeded {
		t.Fatalf("disagreeing observation lost: %+v", got.Verification)
	}
}

func TestVerifyReplayAndConflict(t *testing.T) {
	s, _ := newTestStore(t, 4)
	ctx := context.Background()
	op := mustClaim(t, s, claimReq("alice", "host://n", "job", nil))
	mustBegin(t, s, "alice", op.ID)
	if _, err := s.Fail(ctx, "alice", op.ID); err != nil {
		t.Fatalf("Fail: %v", err)
	}

	v := Verification{Source: "exit-code", Result: ResultFailed, Evidence: "receipt/9"}
	first, err := s.Verify(ctx, "alice", op.ID, v)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	replay, err := s.Verify(ctx, "alice", op.ID, v)
	if err != nil {
		t.Fatalf("identical re-verify: %v", err)
	}
	if !replay.Verification.At.Equal(first.Verification.At) {
		t.Fatalf("replay replaced verification: %s vs %s", replay.Verification.At, first.Verification.At)
	}

	conflict := v
	conflict.Result = ResultSucceeded
	if _, err := s.Verify(ctx, "alice", op.ID, conflict); !errors.Is(err, ErrVerificationConflict) {
		t.Fatalf("conflicting re-verify: %v, want ErrVerificationConflict", err)
	}
	// The conflict must not have overwritten the first observation.
	fresh := mustGet(t, s, "alice", op.ID)
	if fresh.Verification.Result != ResultFailed {
		t.Fatalf("verification overwritten by conflict: %+v", *fresh.Verification)
	}
}

func TestVerifyInputValidation(t *testing.T) {
	s, _ := newTestStore(t, 4)
	ctx := context.Background()
	op := mustClaim(t, s, claimReq("alice", "host://n", "job", nil))
	mustBegin(t, s, "alice", op.ID)
	if _, err := s.Complete(ctx, "alice", op.ID); err != nil {
		t.Fatalf("Complete: %v", err)
	}

	cases := map[string]Verification{
		"missing source":     {Result: ResultSucceeded},
		"unknown result":     {Source: "x", Result: "improvised"},
		"oversized source":   {Source: strings.Repeat("s", MaxSourceBytes+1), Result: ResultSucceeded},
		"oversized evidence": {Source: "x", Result: ResultSucceeded, Evidence: strings.Repeat("e", MaxEvidenceBytes+1)},
	}
	for name, v := range cases {
		if _, err := s.Verify(ctx, "alice", op.ID, v); !errors.Is(err, ErrInvalidRequest) {
			t.Fatalf("%s: %v, want ErrInvalidRequest", name, err)
		}
	}
}
