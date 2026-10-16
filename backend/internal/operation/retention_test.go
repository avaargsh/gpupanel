// SPDX-License-Identifier: Apache-2.0

package operation

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

// TestUnknownOutcomeStaysQueryableWithinObservationWindow covers the review
// gap: once an expired-but-running record transitions to unknown, the outcome
// must remain queryable for an explicit bounded observation interval instead
// of being hidden by record expiry; replay from unknown stays refused, and the
// key is released only by explicit purge (DECISIONS.md D1).
func TestUnknownOutcomeStaysQueryableWithinObservationWindow(t *testing.T) {
	s, clk := newTestStore(t, 4)
	ctx := context.Background()
	req := claimReq("alice", "host://n", "job", []byte("p"))
	op := mustClaim(t, s, req)

	// Begin shortly before the record TTL so the running record outlives its
	// own ExpiresAt — the reviewer's retention scenario.
	clk.Advance(testTTL - 10*time.Second)
	mustBegin(t, s, "alice", op.ID) // deadline = began + testTimeout
	clk.Advance(15 * time.Second)   // past ExpiresAt, still running
	if report, err := s.Reconcile(ctx, "alice"); err != nil ||
		len(report.TimedOut) != 0 || len(report.Purged) != 0 {
		t.Fatalf("premature reconcile: %+v err=%v", report, err)
	}
	clk.Advance(20 * time.Second) // past the running deadline
	if report, err := s.Reconcile(ctx, "alice"); err != nil ||
		len(report.TimedOut) != 1 || report.TimedOut[0] != op.ID {
		t.Fatalf("timeout not reconciled: %+v err=%v", report, err)
	}

	// The record TTL has already elapsed while the outcome is unknown: the
	// unknown outcome must stay observable for the bounded observation window.
	clk.Advance(testWindow / 2) // inside endedAt+ObservationWindow
	got := mustGet(t, s, "alice", op.ID)
	if got.State != StateUnknown {
		t.Fatalf("unknown outcome hidden after TTL: state=%s", got.State)
	}
	if list, _ := s.List(ctx, "alice"); len(list) != 1 || list[0].ID != op.ID {
		t.Fatalf("unknown outcome missing from List: %v", idsOf(list))
	}
	// Verification is available inside the observation window so an
	// independent observer can record what it saw on the unknown outcome.
	if got, err := s.Verify(ctx, "alice", op.ID,
		Verification{Source: "docker-inspect", Result: ResultUnknown, Evidence: "inspect/1"}); err != nil {
		t.Fatalf("Verify within observation window: %v", err)
	} else if got.State != StateUnknown {
		t.Fatalf("Verify changed state: %s", got.State)
	}

	// No replay from unknown, even inside the window: an uncertain outcome is
	// an explicit refusal, never an identity replay.
	_, replayed, err := s.Claim(ctx, req)
	if !errors.Is(err, ErrInvalidTransition) || replayed {
		t.Fatalf("claim on unknown outcome: err=%v replayed=%t, want ErrInvalidTransition", err, replayed)
	}

	// The window bounds visibility; afterwards the record is reclaimable.
	clk.Advance(testWindow + time.Second)
	if _, err := s.Get(ctx, "alice", op.ID); !errors.Is(err, ErrExpired) {
		t.Fatalf("outcome visible past observation window: %v", err)
	}
	if report, err := s.Reconcile(ctx, "alice"); err != nil ||
		len(report.Purged) != 1 || report.Purged[0] != op.ID {
		t.Fatalf("not reclaimed after window: %+v err=%v", report, err)
	}

	// After purge an identical claim opens a NEW identity: indistinguishable
	// from a fresh request. The integrator, not this package, must refuse
	// auto-Begin/re-execution of a retried operation without durable outcome
	// knowledge held at least for the client retry horizon (DECISIONS.md D1).
	fresh, replayed, err := s.Claim(ctx, req)
	if err != nil || replayed {
		t.Fatalf("post-purge claim: err=%v replayed=%t", err, replayed)
	}
	if fresh.ID == op.ID || fresh.State != StatePlanned {
		t.Fatalf("post-purge claim must be a fresh planned identity: %+v", fresh)
	}
}

// TestCompletedOutcomeRetainedForObservationWindow asserts a terminal outcome
// recorded before the record TTL stays queryable for the observation window
// after TTL passes, then becomes reclaimable.
func TestCompletedOutcomeRetainedForObservationWindow(t *testing.T) {
	s, clk := newTestStore(t, 4)
	ctx := context.Background()
	op := mustClaim(t, s, claimReq("alice", "host://n", "job", nil))
	mustBegin(t, s, "alice", op.ID)

	clk.Advance(testTTL - time.Minute) // complete shortly before record expiry
	if _, err := s.Complete(ctx, "alice", op.ID); err != nil {
		t.Fatalf("Complete: %v", err)
	}
	clk.Advance(2 * time.Minute) // past ExpiresAt, inside the observation window

	got := mustGet(t, s, "alice", op.ID)
	if got.State != StateCompleted {
		t.Fatalf("completed outcome hidden after TTL: %+v", got)
	}
	if _, err := s.Verify(ctx, "alice", op.ID,
		Verification{Source: "exit-code", Result: ResultSucceeded, Evidence: "receipt/2"}); err != nil {
		t.Fatalf("Verify within observation window: %v", err)
	}

	clk.Advance(testWindow + time.Second)
	if _, err := s.Get(ctx, "alice", op.ID); !errors.Is(err, ErrExpired) {
		t.Fatalf("outcome visible past observation window: %v", err)
	}
	if report, err := s.Reconcile(ctx, "alice"); err != nil ||
		len(report.Purged) != 1 || report.Purged[0] != op.ID {
		t.Fatalf("not reclaimed after window: %+v err=%v", report, err)
	}
}

// TestReconcileRejectsOversizedOwner is the F3 negative regression: the
// MaxOwnerBytes bound applies at the Reconcile trust boundary too, and a
// rejected oversized-owner call must not reclaim (touch) any record.
func TestReconcileRejectsOversizedOwner(t *testing.T) {
	s, clk := newTestStore(t, 4)
	ctx := context.Background()
	alice := mustClaim(t, s, claimReq("alice", "host://n", "job", nil))
	clk.Advance(testTTL + time.Second) // alice's record is now dead

	oversized := Owner(strings.Repeat("x", MaxOwnerBytes+1))
	if _, err := s.Reconcile(ctx, oversized); !errors.Is(err, ErrInvalidRequest) {
		t.Fatalf("oversized reconcile owner: %v, want ErrInvalidRequest", err)
	}
	if len(oversized) <= MaxOwnerBytes {
		t.Fatal("test owner must exceed the bound")
	}
	// The rejected call reclaimed nothing: alice's dead record is still
	// physically present (ErrExpired, not ErrNotFound).
	if _, err := s.Get(ctx, "alice", alice.ID); !errors.Is(err, ErrExpired) {
		t.Fatalf("oversized-owner reconcile touched a record: %v", err)
	}
	// The legitimate owner can still reclaim afterwards.
	if report, err := s.Reconcile(ctx, "alice"); err != nil ||
		len(report.Purged) != 1 || report.Purged[0] != alice.ID {
		t.Fatalf("owner reclaim after rejection: %+v err=%v", report, err)
	}
}

// TestUnknownVerificationIsNeitherSuccessNorReplayGate is the F4 domain
// regression: unknown state agreeing with an unknown observation makes
// IndependentlyVerified() true, but that boolean must not be readable as
// success or as a replay-safety gate — every execution path stays refused.
func TestUnknownVerificationIsNeitherSuccessNorReplayGate(t *testing.T) {
	s, clk := newTestStore(t, 4)
	ctx := context.Background()
	req := claimReq("alice", "host://n", "job", []byte("p"))
	op := mustClaim(t, s, req)
	mustBegin(t, s, "alice", op.ID)
	clk.Advance(testTimeout + time.Second)
	if _, err := s.Reconcile(ctx, "alice"); err != nil {
		t.Fatalf("Reconcile: %v", err)
	}

	got, err := s.Verify(ctx, "alice", op.ID,
		Verification{Source: "docker-inspect", Result: ResultUnknown, Evidence: "inspect/gone"})
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if !got.IndependentlyVerified() {
		t.Fatalf("unknown/unknown agreement expected: %+v", got)
	}
	// The domain distinction: agreement is not success and not a replay gate.
	if got.State != StateUnknown || got.State.Result() != ResultUnknown {
		t.Fatalf("agreement must not read as a known success: %+v", got)
	}
	if got.IndependentlyVerified() && (got.State != StateCompleted || got.Verification.Result != ResultSucceeded) {
		t.Log("IndependentlyVerified is true for unknown/unknown — never gate success or replay on it (DECISIONS.md D3)")
	}
	if _, replayed, err := s.Claim(ctx, req); !errors.Is(err, ErrInvalidTransition) || replayed {
		t.Fatalf("replay gate held? claim on unknown: err=%v replayed=%t", err, replayed)
	}
	if _, _, err := s.Begin(ctx, "alice", op.ID); !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("Begin on verified-unknown: %v", err)
	}
	if _, err := s.Complete(ctx, "alice", op.ID); !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("Complete on verified-unknown: %v", err)
	}
}
