// SPDX-License-Identifier: Apache-2.0

package operation

import (
	"context"
	"sync"
	"testing"
	"time"
)

// fakeClock is the injected deterministic clock. It carries its own mutex so
// tests may advance time while goroutines read the clock through the store
// under the race detector.
type fakeClock struct {
	mu  sync.Mutex
	now time.Time
}

func newFakeClock() *fakeClock {
	return &fakeClock{now: time.Date(2026, 10, 16, 12, 0, 0, 0, time.UTC)}
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *fakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = c.now.Add(d)
}

const (
	testTTL      = time.Hour
	testTimeout  = 30 * time.Second
	testCapacity = 4
)

func newTestStore(t *testing.T, capacity int) (*Store, *fakeClock) {
	t.Helper()
	clk := newFakeClock()
	s, err := New(Config{
		Capacity:       capacity,
		RecordTTL:      testTTL,
		RunningTimeout: testTimeout,
		Clock:          clk,
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return s, clk
}

func claimReq(owner Owner, resource, key string, params []byte) ClaimRequest {
	return ClaimRequest{Owner: owner, Resource: resource, Key: key, Params: params}
}

func mustClaim(t *testing.T, s *Store, req ClaimRequest) Operation {
	t.Helper()
	op, replayed, err := s.Claim(context.Background(), req)
	if err != nil {
		t.Fatalf("Claim(%q): %v", req.Key, err)
	}
	if replayed {
		t.Fatalf("Claim(%q): unexpected replay of new identity", req.Key)
	}
	return op
}

func mustBegin(t *testing.T, s *Store, owner Owner, id string) Operation {
	t.Helper()
	op, transitioned, err := s.Begin(context.Background(), owner, id)
	if err != nil {
		t.Fatalf("Begin(%s): %v", id, err)
	}
	if !transitioned {
		t.Fatalf("Begin(%s): expected a transition", id)
	}
	return op
}

func mustGet(t *testing.T, s *Store, owner Owner, id string) Operation {
	t.Helper()
	op, err := s.Get(context.Background(), owner, id)
	if err != nil {
		t.Fatalf("Get(%s): %v", id, err)
	}
	return op
}
