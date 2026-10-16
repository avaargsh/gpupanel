package hostobserve

import (
	"context"
	"errors"
	"testing"
	"time"
)

// Context-cancellation semantics: a pre-cancelled or expired context must
// perform no read at all, and cancellation between two bounded reads must
// abort the pass and discard partial data.

func TestPreCancelledContext(t *testing.T) {
	f := newFixture(t)
	c, err := NewWithPaths(
		f.write(t, "os-release", validOSRelease),
		f.write(t, "meminfo", validMeminfo),
		f.write(t, "uptime", validUptime),
	)
	if err != nil {
		t.Fatalf("NewWithPaths: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	snap, err := c.Collect(ctx)
	if !errors.Is(err, context.Canceled) {
		t.Errorf("err = %v, want context.Canceled", err)
	}
	if snap != (Snapshot{}) {
		t.Errorf("pre-cancelled pass must return the zero snapshot, got %+v", snap)
	}

	expired, cancel2 := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer cancel2()
	if _, err := c.Collect(expired); !errors.Is(err, context.DeadlineExceeded) {
		t.Errorf("err = %v, want context.DeadlineExceeded", err)
	}
}

// stepCancelContext fails Err() from the failAt-th call onwards, letting a
// test cancel exactly between two bounded reads. Collect checks ctx.Err()
// once before each of the three reads and nowhere else.
type stepCancelContext struct {
	context.Context
	calls  int
	failAt int
}

func (c *stepCancelContext) Err() error {
	c.calls++
	if c.calls >= c.failAt {
		return context.Canceled
	}
	return c.Context.Err()
}

func TestCancellationBetweenReads(t *testing.T) {
	for _, tc := range []struct {
		name      string
		failAt    int
		wantCalls int
	}{
		{"before first read", 1, 1},
		{"between os-release and meminfo", 2, 2},
		{"between meminfo and uptime", 3, 3},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := newFixture(t)
			c, err := NewWithPaths(
				f.write(t, "os-release", validOSRelease),
				f.write(t, "meminfo", validMeminfo),
				f.write(t, "uptime", validUptime),
			)
			if err != nil {
				t.Fatalf("NewWithPaths: %v", err)
			}
			ctx := &stepCancelContext{Context: context.Background(), failAt: tc.failAt}
			snap, err := c.Collect(ctx)
			if !errors.Is(err, context.Canceled) {
				t.Errorf("err = %v, want context.Canceled", err)
			}
			if snap != (Snapshot{}) {
				t.Errorf("aborted pass must discard partial data, got %+v", snap)
			}
			if ctx.calls != tc.wantCalls {
				t.Errorf("ctx.Err() calls = %d, want %d", ctx.calls, tc.wantCalls)
			}
		})
	}
}
