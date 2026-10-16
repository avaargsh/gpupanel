// SPDX-License-Identifier: Apache-2.0

package hostmetrics

import (
	"context"
	"errors"
	"math"
	"os"
	"testing"
	"time"
)

// Context-cancellation contract: a pre-cancelled or expired context must
// perform no read at all, cancellation between two bounded reads must abort
// the pass and discard partial data, and a successful pass must check the
// context exactly once before each of the four reads.

// countingOpen counts how many source files were actually opened. Combined
// with stepContext it proves both halves of the contract: the check exists
// before every read, and a cancelled pass opens nothing.
type countingOpen struct {
	calls int
}

func (c *countingOpen) open(name string) (*os.File, error) {
	c.calls++
	return os.Open(name)
}

// stepContext fails Err() from the failAt-th call onwards, so a test can
// cancel exactly before the first read or between two reads. Collect calls
// ctx.Err() once before each read and nowhere else.
type stepContext struct {
	context.Context
	calls  int
	failAt int
}

func (c *stepContext) Err() error {
	c.calls++
	if c.calls >= c.failAt {
		return context.Canceled
	}
	return c.Context.Err()
}

// collectorWithCounter returns a fixture collector whose opens are counted.
func collectorWithCounter(t *testing.T) (*Collector, *countingOpen) {
	t.Helper()
	c := newTestCollector(t, newFixture(t))
	counter := &countingOpen{}
	c.open = counter.open
	return c, counter
}

func TestPreCancelledContextOpensNothing(t *testing.T) {
	c, counter := collectorWithCounter(t)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	snap, err := c.Collect(ctx)
	if !errors.Is(err, context.Canceled) {
		t.Errorf("err = %v, want context.Canceled", err)
	}
	if snap != (Snapshot{}) {
		t.Errorf("pre-cancelled pass must return the zero snapshot, got %+v", snap)
	}
	if counter.calls != 0 {
		t.Errorf("opens = %d, want 0: a pre-cancelled context must perform no read", counter.calls)
	}

	expired, cancel2 := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer cancel2()
	if _, err := c.Collect(expired); !errors.Is(err, context.DeadlineExceeded) {
		t.Errorf("err = %v, want context.DeadlineExceeded", err)
	}
	if counter.calls != 0 {
		t.Errorf("opens = %d after deadline, want 0", counter.calls)
	}
}

func TestCancellationBetweenReads(t *testing.T) {
	for _, tc := range []struct {
		name      string
		failAt    int
		wantOpens int
	}{
		{"before first read", 1, 0},
		{"between loadavg and cpu", 2, 1},
		{"between cpu and memory", 3, 2},
		{"between memory and io", 4, 3},
	} {
		t.Run(tc.name, func(t *testing.T) {
			c, counter := collectorWithCounter(t)
			ctx := &stepContext{Context: context.Background(), failAt: tc.failAt}
			snap, err := c.Collect(ctx)
			if !errors.Is(err, context.Canceled) {
				t.Errorf("err = %v, want context.Canceled", err)
			}
			if snap != (Snapshot{}) {
				t.Errorf("aborted pass must discard partial data, got %+v", snap)
			}
			if ctx.calls != tc.failAt {
				t.Errorf("ctx.Err() calls = %d, want %d", ctx.calls, tc.failAt)
			}
			if counter.calls != tc.wantOpens {
				t.Errorf("opens = %d, want %d: cancellation must precede each remaining read",
					counter.calls, tc.wantOpens)
			}
		})
	}
}

func TestSuccessfulPassChecksBeforeEveryRead(t *testing.T) {
	c, counter := collectorWithCounter(t)
	ctx := &stepContext{Context: context.Background(), failAt: math.MaxInt}
	snap, err := c.Collect(ctx)
	if err != nil {
		t.Fatalf("Collect: %v", err)
	}
	if ctx.calls != 4 {
		t.Errorf("ctx.Err() calls = %d, want exactly one check per read (4)", ctx.calls)
	}
	if counter.calls != 4 {
		t.Errorf("opens = %d, want 4 (one per source)", counter.calls)
	}
	if snap.Load.Status != StatusAvailable || snap.IO.Status != StatusAvailable {
		t.Errorf("expected a full available snapshot, got %+v", snap)
	}
}

func TestNilContextRejected(t *testing.T) {
	c, counter := collectorWithCounter(t)
	snap, err := c.Collect(nil)
	if !errors.Is(err, ErrBadArgument) {
		t.Errorf("err = %v, want ErrBadArgument", err)
	}
	if snap != (Snapshot{}) {
		t.Errorf("nil-context call must return the zero snapshot, got %+v", snap)
	}
	if counter.calls != 0 {
		t.Errorf("opens = %d, want 0", counter.calls)
	}
}
