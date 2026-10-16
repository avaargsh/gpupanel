// SPDX-License-Identifier: Apache-2.0

package hostmetrics

import (
	"context"
	"errors"
	"math"
	"runtime"
	"testing"
)

// TestRealLinuxSmoke reads the four real system files on a Linux host and
// asserts meaningful invariants. It only performs reads; no system state is
// written, no command is executed, no environment variable or credential is
// consulted, and the package under test starts no goroutine.
//
// This smoke proves local read-only collection on this machine only. It
// does not prove an Ubuntu installation, an API contract, an authenticated
// route, or any UI behaviour.
func TestRealLinuxSmoke(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skipf("real host smoke requires Linux, running on %s", runtime.GOOS)
	}

	snap, err := New().Collect(context.Background())
	if err != nil {
		t.Fatalf("Collect on real host: %v", err)
	}

	// /proc/loadavg must be available and internally consistent on a
	// running Linux system (the parser already enforces the value domain;
	// these assertions restate the invariants on real data).
	if snap.Load.Status != StatusAvailable {
		t.Fatalf("loadavg status = %q err = %v", snap.Load.Status, snap.Load.Err)
	}
	for name, v := range map[string]float64{
		"Load1": snap.Load.Load1, "Load5": snap.Load.Load5, "Load15": snap.Load.Load15,
	} {
		if math.IsNaN(v) || math.IsInf(v, 0) || v < 0 {
			t.Errorf("%s = %v, want finite and >= 0", name, v)
		}
	}
	if snap.Load.RunningTasks > snap.Load.TotalTasks {
		t.Errorf("running %d exceeds total %d on a real host",
			snap.Load.RunningTasks, snap.Load.TotalTasks)
	}
	if snap.Load.TotalTasks == 0 {
		t.Errorf("a running kernel always has schedulable entities")
	}
	if snap.Load.LastPID == 0 {
		t.Errorf("a real host has forked at least PID 1")
	}

	// PSI: available means parsed and inside 0..100 percent; a kernel
	// built without CONFIG_PSI yields the explicit missing state, which is
	// accepted and logged — it must never appear as an available zero
	// success or as malformed/unavailable.
	for _, src := range []struct {
		name string
		p    PressureSnapshot
	}{
		{"cpu", snap.CPU}, {"memory", snap.Memory}, {"io", snap.IO},
	} {
		switch src.p.Status {
		case StatusAvailable:
			for _, a := range []float64{
				src.p.Some.Avg10Percent, src.p.Some.Avg60Percent, src.p.Some.Avg300Percent,
				src.p.Full.Avg10Percent, src.p.Full.Avg60Percent, src.p.Full.Avg300Percent,
			} {
				if math.IsNaN(a) || math.IsInf(a, 0) || a < 0 || a > 100 {
					t.Errorf("%s average %v out of 0..100", src.name, a)
				}
			}
		case StatusMissing:
			if !errors.Is(src.p.Err, ErrMissing) {
				t.Errorf("%s missing state must carry ErrMissing, got %v", src.name, src.p.Err)
			}
			t.Logf("PSI source %s absent (explicit missing state, not a zero success)", src.name)
		default:
			t.Errorf("PSI source %s status = %q err = %v, want available or missing",
				src.name, src.p.Status, src.p.Err)
		}
	}
}
