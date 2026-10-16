// SPDX-License-Identifier: Apache-2.0

package operation

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
)

// TestSimultaneousClaimYieldsSingleIdentity proves the claim is atomic: under
// concurrent identical claims exactly one call creates the record and every
// caller observes the same identity. Run with -race.
func TestSimultaneousClaimYieldsSingleIdentity(t *testing.T) {
	s, _ := newTestStore(t, 8)
	req := claimReq("alice", "host://n", "hot-key", []byte("same-params"))
	const workers = 16

	type outcome struct {
		id       string
		replayed bool
		err      error
	}
	results := make([]outcome, workers)
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			op, replayed, err := s.Claim(context.Background(), req)
			results[i] = outcome{id: op.ID, replayed: replayed, err: err}
		}(i)
	}
	close(start)
	wg.Wait()

	created := 0
	id := ""
	for i, got := range results {
		if got.err != nil {
			t.Fatalf("worker %d: %v", i, got.err)
		}
		if id == "" {
			id = got.id
		}
		if got.id != id {
			t.Fatalf("worker %d saw identity %s, want %s", i, got.id, id)
		}
		if !got.replayed {
			created++
		}
	}
	if created != 1 {
		t.Fatalf("record created %d times, want exactly 1", created)
	}
	// A conflicting parameter set must lose to the winner deterministically.
	changed := req
	changed.Params = []byte("other-params")
	if _, _, err := s.Claim(context.Background(), changed); !errors.Is(err, ErrDigestMismatch) {
		t.Fatalf("post-race digest mismatch: %v", err)
	}
}

// TestSimultaneousBeginTransitionsOnce proves the planned->running claim is
// atomic: exactly one goroutine transitions, the rest replay.
func TestSimultaneousBeginTransitionsOnce(t *testing.T) {
	s, _ := newTestStore(t, 4)
	op := mustClaim(t, s, claimReq("alice", "host://n", "job", nil))
	const workers = 12

	transitions := make([]bool, workers)
	starts := make([]int64, workers) // StartedAt unix nanos, 0 until set
	errs := make([]error, workers)
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			got, transitioned, err := s.Begin(context.Background(), "alice", op.ID)
			errs[i] = err
			transitions[i] = transitioned
			if err == nil {
				starts[i] = got.StartedAt.UnixNano()
			}
		}(i)
	}
	close(start)
	wg.Wait()

	transitionedCount := 0
	var started int64
	for i := 0; i < workers; i++ {
		if errs[i] != nil {
			t.Fatalf("worker %d: %v", i, errs[i])
		}
		if transitions[i] {
			transitionedCount++
		}
		if started == 0 {
			started = starts[i]
		}
		if starts[i] != started {
			t.Fatalf("worker %d saw StartedAt %d, want %d", i, starts[i], started)
		}
	}
	if transitionedCount != 1 {
		t.Fatalf("planned->running executed %d times, want exactly 1", transitionedCount)
	}
	final := mustGet(t, s, "alice", op.ID)
	if final.State != StateRunning || final.StartedAt.UnixNano() != started {
		t.Fatalf("final state %+v does not match the single transition", final)
	}
}

// TestConcurrentClaimsWithFiniteCapacity proves the capacity bound rejects
// precisely the overflow under a race, without evicting any accepted record.
func TestConcurrentClaimsWithFiniteCapacity(t *testing.T) {
	const capacity = 4
	s, _ := newTestStore(t, capacity)
	const workers = 16

	accepted := make([]bool, workers)
	errs := make([]error, workers)
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			_, _, err := s.Claim(context.Background(), claimReq("alice", "host://n", fmt.Sprintf("key-%d", i), nil))
			errs[i] = err
			accepted[i] = err == nil
		}(i)
	}
	close(start)
	wg.Wait()

	okCount, fullCount := 0, 0
	for i := 0; i < workers; i++ {
		switch {
		case errs[i] == nil:
			okCount++
		case errors.Is(errs[i], ErrCapacity):
			fullCount++
		default:
			t.Fatalf("worker %d: unexpected error %v", i, errs[i])
		}
	}
	if okCount != capacity || fullCount != workers-capacity {
		t.Fatalf("accepted=%d rejected=%d, want %d/%d", okCount, fullCount, capacity, workers-capacity)
	}
	list, err := s.List(context.Background(), "alice")
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != capacity {
		t.Fatalf("store holds %d records, want %d (no eviction, no acceptance past bound)", len(list), capacity)
	}
}

// TestConcurrentMixedLifecycle exercises readers, transitions, claims and
// reconciliation simultaneously to surface data races under -race.
func TestConcurrentMixedLifecycle(t *testing.T) {
	s, _ := newTestStore(t, 16)
	ctx := context.Background()
	op := mustClaim(t, s, claimReq("alice", "host://n", "main", nil))
	const readers = 4
	const claimKeys = 6

	var wg sync.WaitGroup
	// Writer: begin then complete.
	wg.Add(1)
	go func() {
		defer wg.Done()
		if _, _, err := s.Begin(ctx, "alice", op.ID); err != nil {
			t.Errorf("Begin: %v", err)
		}
		if _, err := s.Complete(ctx, "alice", op.ID); err != nil {
			t.Errorf("Complete: %v", err)
		}
	}()
	// Racing begin: the writer may already have completed the record, so the
	// only admissible error is a rejected invalid transition.
	wg.Add(1)
	go func() {
		defer wg.Done()
		if _, _, err := s.Begin(ctx, "alice", op.ID); err != nil && !errors.Is(err, ErrInvalidTransition) {
			t.Errorf("concurrent Begin: %v", err)
		}
	}()
	// Readers: queries only, never a state change.
	for r := 0; r < readers; r++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < 50; i++ {
				got, err := s.Get(ctx, "alice", op.ID)
				if err != nil {
					t.Errorf("Get: %v", err)
					return
				}
				if !got.State.Valid() {
					t.Errorf("invalid state %q", got.State)
					return
				}
			}
		}()
	}
	// Claims of fresh keys.
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < claimKeys; i++ {
			if _, _, err := s.Claim(ctx, claimReq("alice", "host://n", fmt.Sprintf("extra-%d", i), nil)); err != nil {
				t.Errorf("extra claim %d: %v", i, err)
			}
		}
	}()
	// Reconciler with frozen clock: must be a no-op every time.
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < 25; i++ {
			report, err := s.Reconcile(ctx, "alice")
			if err != nil {
				t.Errorf("Reconcile: %v", err)
				return
			}
			if len(report.TimedOut) != 0 || len(report.Purged) != 0 {
				t.Errorf("frozen-clock reconcile changed records: %+v", report)
				return
			}
		}
	}()
	wg.Wait()

	final := mustGet(t, s, "alice", op.ID)
	if final.State != StateCompleted {
		t.Fatalf("final state = %s, want completed", final.State)
	}
	list, err := s.List(ctx, "alice")
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 1+claimKeys {
		t.Fatalf("record count = %d, want %d", len(list), 1+claimKeys)
	}
}
