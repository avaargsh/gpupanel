package hostobserve

import (
	"context"
	"runtime"
	"testing"
)

// TestRealLinuxSmoke reads the three real system files on a Linux host and
// asserts meaningful invariants. It only performs reads; no system state is
// written, no command is executed, no environment variable or process
// information is consulted by the package under test.
//
// This smoke proves local collection on this machine only. It does not
// prove an Ubuntu installation, an API contract, or any UI behaviour.
func TestRealLinuxSmoke(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skipf("real host smoke requires Linux, running on %s", runtime.GOOS)
	}

	snap, err := New().Collect(context.Background())
	if err != nil {
		t.Fatalf("Collect on real host: %v", err)
	}

	if snap.OS.Status != StatusAvailable {
		t.Fatalf("os-release status = %q err = %v", snap.OS.Status, snap.OS.Err)
	}
	if snap.OS.Name == "" || snap.OS.ID == "" {
		t.Errorf("os-release identity must be non-empty on a real host: %+v", snap.OS)
	}

	if snap.Memory.Status != StatusAvailable {
		t.Fatalf("meminfo status = %q err = %v", snap.Memory.Status, snap.Memory.Err)
	}
	if snap.Memory.MemTotalBytes == 0 {
		t.Errorf("MemTotalBytes must be positive on a running host")
	}
	if snap.Memory.MemAvailableBytes > snap.Memory.MemTotalBytes {
		t.Errorf("MemAvailableBytes (%d) must not exceed MemTotalBytes (%d)",
			snap.Memory.MemAvailableBytes, snap.Memory.MemTotalBytes)
	}
	if snap.Memory.MemTotalBytes%1024 != 0 {
		t.Errorf("MemTotalBytes (%d) must be a whole number of kB", snap.Memory.MemTotalBytes)
	}

	if snap.Uptime.Status != StatusAvailable {
		t.Fatalf("uptime status = %q err = %v", snap.Uptime.Status, snap.Uptime.Err)
	}
	const maxPlausibleSeconds = 100 * 365 * 24 * 60 * 60 // 100 years
	if snap.Uptime.UptimeSeconds <= 0 || snap.Uptime.UptimeSeconds > maxPlausibleSeconds {
		t.Errorf("UptimeSeconds = %v, want (0, 100y]", snap.Uptime.UptimeSeconds)
	}
	if snap.Uptime.IdleSeconds < 0 || snap.Uptime.IdleSeconds > maxPlausibleSeconds*1024 {
		t.Errorf("IdleSeconds = %v, out of plausible range", snap.Uptime.IdleSeconds)
	}
}
