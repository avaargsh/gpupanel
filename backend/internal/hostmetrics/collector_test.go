// SPDX-License-Identifier: Apache-2.0

package hostmetrics

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"
)

// Fixture contents. Distinct values per source make a swapped or
// mis-mapped snapshot section detectable.
const (
	validLoadavg = "3.15 2.12 1.72 13/2696 859144\n"
	validCPU     = "some avg10=1.25 avg60=0.50 avg300=0.10 total=266158139\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=0\n"
	validMemory  = "some avg10=0.00 avg60=0.00 avg300=0.00 total=5253458\nfull avg10=0.10 avg60=0.20 avg300=0.30 total=5160827\n"
	validIO      = "some avg10=50.00 avg60=60.00 avg300=70.00 total=148504042\nfull avg10=40.00 avg60=30.00 avg300=20.00 total=143444200\n"
)

type fixture struct {
	dir string
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	return &fixture{dir: t.TempDir()}
}

func (f *fixture) write(t *testing.T, name, content string) string {
	t.Helper()
	p := filepath.Join(f.dir, name)
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		t.Fatalf("write fixture %s: %v", name, err)
	}
	return p
}

// newTestCollector builds a collector over four valid fixture files.
func newTestCollector(t *testing.T, f *fixture) *Collector {
	t.Helper()
	c, err := NewWithPaths(
		f.write(t, "loadavg", validLoadavg),
		f.write(t, "cpu", validCPU),
		f.write(t, "memory", validMemory),
		f.write(t, "io", validIO),
	)
	if err != nil {
		t.Fatalf("NewWithPaths: %v", err)
	}
	return c
}

// paddedLoadavg builds a valid loadavg line padded with separator spaces to
// exactly size bytes (still five whitespace-separated fields).
func paddedLoadavg(size int) string {
	const head = "0.52 0.58 0.59 2/1029 "
	const tail = "12345\n"
	pad := size - len(head) - len(tail)
	if pad < 0 {
		panic("paddedLoadavg: size too small")
	}
	return head + strings.Repeat(" ", pad) + tail
}

// paddedPressure builds a valid PSI file padded with separator spaces after
// the "some" label to exactly size bytes.
func paddedPressure(size int) string {
	const head = "some"
	const tail = " avg10=0.00 avg60=0.00 avg300=0.00 total=0\n" +
		"full avg10=0.00 avg60=0.00 avg300=0.00 total=0\n"
	pad := size - len(head) - len(tail)
	if pad < 0 {
		panic("paddedPressure: size too small")
	}
	return head + strings.Repeat(" ", pad) + tail
}

func TestCollectValidFixtures(t *testing.T) {
	f := newFixture(t)
	c := newTestCollector(t, f)

	snap, err := c.Collect(context.Background())
	if err != nil {
		t.Fatalf("Collect: %v", err)
	}

	if snap.Load.Status != StatusAvailable {
		t.Fatalf("loadavg status = %q err = %v", snap.Load.Status, snap.Load.Err)
	}
	if snap.Load.Load1 != 3.15 || snap.Load.Load5 != 2.12 || snap.Load.Load15 != 1.72 {
		t.Errorf("loads = %v/%v/%v, want 3.15/2.12/1.72",
			snap.Load.Load1, snap.Load.Load5, snap.Load.Load15)
	}
	if snap.Load.RunningTasks != 13 || snap.Load.TotalTasks != 2696 || snap.Load.LastPID != 859144 {
		t.Errorf("tasks/pid = %d/%d/%d, want 13/2696/859144",
			snap.Load.RunningTasks, snap.Load.TotalTasks, snap.Load.LastPID)
	}

	for name, p := range map[string]PressureSnapshot{
		"cpu": snap.CPU, "memory": snap.Memory, "io": snap.IO,
	} {
		if p.Status != StatusAvailable {
			t.Errorf("%s status = %q err = %v, want available", name, p.Status, p.Err)
		}
	}

	for _, tc := range []struct {
		name string
		got  PressureStall
		want PressureStall
	}{
		{"cpu.some", snap.CPU.Some, PressureStall{1.25, 0.50, 0.10, 266158139}},
		{"cpu.full", snap.CPU.Full, PressureStall{0, 0, 0, 0}},
		{"memory.some", snap.Memory.Some, PressureStall{0, 0, 0, 5253458}},
		{"memory.full", snap.Memory.Full, PressureStall{0.10, 0.20, 0.30, 5160827}},
		{"io.some", snap.IO.Some, PressureStall{50, 60, 70, 148504042}},
		{"io.full", snap.IO.Full, PressureStall{40, 30, 20, 143444200}},
	} {
		if tc.got != tc.want {
			t.Errorf("%s = %+v, want %+v", tc.name, tc.got, tc.want)
		}
	}
}

// A missing PSI source (ENOENT) must surface as StatusMissing with
// ErrMissing — never as an available, all-zero success.
func TestMissingPressureSourceIsExplicitNotZero(t *testing.T) {
	f := newFixture(t)
	missingCPU := filepath.Join(f.dir, "no-such-cpu-pressure")
	missingIO := filepath.Join(f.dir, "no-such-io-pressure")
	c, err := NewWithPaths(
		f.write(t, "loadavg", validLoadavg),
		missingCPU,
		f.write(t, "memory", validMemory),
		missingIO,
	)
	if err != nil {
		t.Fatalf("NewWithPaths: %v", err)
	}

	snap, err := c.Collect(context.Background())
	if err != nil {
		t.Fatalf("partial pass must not fail: %v", err)
	}
	if snap.Load.Status != StatusAvailable || snap.Memory.Status != StatusAvailable {
		t.Errorf("present sources must stay available: %+v", snap)
	}
	for name, p := range map[string]PressureSnapshot{"cpu": snap.CPU, "io": snap.IO} {
		if p.Status != StatusMissing {
			t.Errorf("%s status = %q, want missing", name, p.Status)
		}
		if p.Status == StatusAvailable {
			t.Errorf("%s must not look like a successful zero", name)
		}
		if !errors.Is(p.Err, ErrMissing) {
			t.Errorf("%s err = %v, want ErrMissing", name, p.Err)
		}
	}
}

func TestMalformedSourceDoesNotAffectOthers(t *testing.T) {
	f := newFixture(t)
	c, err := NewWithPaths(
		f.write(t, "loadavg", "abc 0.10 0.20 1/2 3\n"),
		f.write(t, "cpu", validCPU),
		f.write(t, "memory", validMemory),
		f.write(t, "io", validIO),
	)
	if err != nil {
		t.Fatalf("NewWithPaths: %v", err)
	}
	snap, err := c.Collect(context.Background())
	if err != nil {
		t.Fatalf("Collect: %v", err)
	}
	if snap.Load.Status != StatusMalformed || !errors.Is(snap.Load.Err, ErrMalformed) {
		t.Errorf("load status = %q err = %v, want malformed/ErrMalformed", snap.Load.Status, snap.Load.Err)
	}
	if snap.CPU.Status != StatusAvailable || snap.Memory.Status != StatusAvailable ||
		snap.IO.Status != StatusAvailable {
		t.Errorf("valid sources must stay available: %+v", snap)
	}
}

func TestReadBoundsExactAndOversize(t *testing.T) {
	f := newFixture(t)

	atLimit := f.write(t, "loadavg-limit", paddedLoadavg(maxLoadavgBytes))
	overLimit := f.write(t, "loadavg-over", paddedLoadavg(maxLoadavgBytes+1))
	junk := f.write(t, "cpu-junk", strings.Repeat("A", 200_000))
	c, err := NewWithPaths(atLimit, junk, f.write(t, "memory", validMemory),
		f.write(t, "io", validIO))
	if err != nil {
		t.Fatalf("NewWithPaths: %v", err)
	}
	snap, err := c.Collect(context.Background())
	if err != nil {
		t.Fatalf("Collect: %v", err)
	}
	if snap.Load.Status != StatusAvailable {
		t.Errorf("content exactly at the bound must parse: status=%q err=%v",
			snap.Load.Status, snap.Load.Err)
	}
	if snap.CPU.Status != StatusUnavailable || !errors.Is(snap.CPU.Err, ErrTooLarge) {
		t.Errorf("200KB junk: status=%q err=%v, want unavailable/ErrTooLarge",
			snap.CPU.Status, snap.CPU.Err)
	}

	// Same bounds on the loadavg slot and a padded PSI file at its bound.
	c2, err := NewWithPaths(overLimit, f.write(t, "cpu", validCPU),
		f.write(t, "memory", validMemory), f.write(t, "io", validIO))
	if err != nil {
		t.Fatalf("NewWithPaths: %v", err)
	}
	snap2, err := c2.Collect(context.Background())
	if err != nil {
		t.Fatalf("Collect: %v", err)
	}
	if snap2.Load.Status != StatusUnavailable || !errors.Is(snap2.Load.Err, ErrTooLarge) {
		t.Errorf("loadavg over bound: status=%q err=%v, want unavailable/ErrTooLarge",
			snap2.Load.Status, snap2.Load.Err)
	}

	f2 := newFixture(t)
	psiAt := f2.write(t, "psi-limit", paddedPressure(maxPressureBytes))
	psiOver := f2.write(t, "psi-over", paddedPressure(maxPressureBytes+1))
	c3, err := NewWithPaths(f2.write(t, "loadavg", validLoadavg), psiOver,
		f2.write(t, "memory", validMemory), psiAt)
	if err != nil {
		t.Fatalf("NewWithPaths: %v", err)
	}
	snap3, err := c3.Collect(context.Background())
	if err != nil {
		t.Fatalf("Collect: %v", err)
	}
	if snap3.CPU.Status != StatusUnavailable || !errors.Is(snap3.CPU.Err, ErrTooLarge) {
		t.Errorf("pressure over bound: status=%q err=%v, want unavailable/ErrTooLarge",
			snap3.CPU.Status, snap3.CPU.Err)
	}
	if snap3.IO.Status != StatusAvailable {
		t.Errorf("pressure exactly at the bound must parse: status=%q err=%v",
			snap3.IO.Status, snap3.IO.Err)
	}
}

func TestNonRegularSourcesRejectedWithoutBlocking(t *testing.T) {
	f := newFixture(t)
	dir := f.dir
	fifo := filepath.Join(f.dir, "fifo")
	if err := syscall.Mkfifo(fifo, 0o600); err != nil {
		t.Fatalf("mkfifo: %v", err)
	}

	// The FIFO occupies the io slot: the collector must reject it as a
	// non-regular source without ever opening (and blocking on) it.
	c, err := NewWithPaths(f.write(t, "loadavg", validLoadavg),
		f.write(t, "cpu", validCPU), f.write(t, "memory", validMemory), fifo)
	if err != nil {
		t.Fatalf("NewWithPaths: %v", err)
	}

	type result struct {
		snap Snapshot
		err  error
	}
	done := make(chan result, 1)
	go func() {
		s, e := c.Collect(context.Background())
		done <- result{s, e}
	}()
	var got result
	select {
	case got = <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("Collect blocked opening a FIFO source; the pre-open regular-file check is missing")
	}
	if got.err != nil {
		t.Fatalf("Collect: %v", got.err)
	}
	if got.snap.IO.Status != StatusUnavailable || !errors.Is(got.snap.IO.Err, ErrUnavailable) {
		t.Errorf("FIFO status = %q err = %v, want unavailable/ErrUnavailable",
			got.snap.IO.Status, got.snap.IO.Err)
	}

	// Directory as a source: rejected the same way.
	cDir, err := NewWithPaths(f.write(t, "loadavg", validLoadavg),
		f.write(t, "cpu", validCPU), dir, f.write(t, "io", validIO))
	if err != nil {
		t.Fatalf("NewWithPaths: %v", err)
	}
	snap, err := cDir.Collect(context.Background())
	if err != nil {
		t.Fatalf("Collect: %v", err)
	}
	if snap.Memory.Status != StatusUnavailable || !errors.Is(snap.Memory.Err, ErrUnavailable) {
		t.Errorf("directory status = %q err = %v, want unavailable/ErrUnavailable",
			snap.Memory.Status, snap.Memory.Err)
	}
}

func TestSymlinkHandling(t *testing.T) {
	f := newFixture(t)
	target := f.write(t, "loadavg-target", validLoadavg)
	good := filepath.Join(f.dir, "loadavg-link")
	if err := os.Symlink(target, good); err != nil {
		t.Fatalf("symlink: %v", err)
	}
	broken := filepath.Join(f.dir, "broken-link")
	if err := os.Symlink(filepath.Join(f.dir, "gone"), broken); err != nil {
		t.Fatalf("symlink: %v", err)
	}

	c, err := NewWithPaths(good, broken, f.write(t, "memory", validMemory),
		f.write(t, "io", validIO))
	if err != nil {
		t.Fatalf("NewWithPaths: %v", err)
	}
	snap, err := c.Collect(context.Background())
	if err != nil {
		t.Fatalf("Collect: %v", err)
	}
	if snap.Load.Status != StatusAvailable {
		t.Errorf("symlink to regular file must be followed: status=%q", snap.Load.Status)
	}
	if snap.CPU.Status != StatusMissing || !errors.Is(snap.CPU.Err, ErrMissing) {
		t.Errorf("broken symlink status = %q err = %v, want missing/ErrMissing",
			snap.CPU.Status, snap.CPU.Err)
	}
}

func TestUnreadableSource(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("running as root; file permissions do not deny access")
	}
	f := newFixture(t)
	cpu := f.write(t, "cpu", validCPU)
	if err := os.Chmod(cpu, 0); err != nil {
		t.Fatalf("chmod: %v", err)
	}
	t.Cleanup(func() { _ = os.Chmod(cpu, 0o644) })

	c, err := NewWithPaths(f.write(t, "loadavg", validLoadavg), cpu,
		f.write(t, "memory", validMemory), f.write(t, "io", validIO))
	if err != nil {
		t.Fatalf("NewWithPaths: %v", err)
	}
	snap, err := c.Collect(context.Background())
	if err != nil {
		t.Fatalf("Collect: %v", err)
	}
	if snap.CPU.Status != StatusUnavailable || !errors.Is(snap.CPU.Err, ErrUnavailable) {
		t.Errorf("unreadable status = %q err = %v, want unavailable/ErrUnavailable",
			snap.CPU.Status, snap.CPU.Err)
	}
	if snap.Load.Status != StatusAvailable {
		t.Errorf("other sources must stay available: %q", snap.Load.Status)
	}
}

func TestNewWithPathsValidation(t *testing.T) {
	for _, tc := range []struct {
		name       string
		a, b, c, d string
	}{
		{"empty path", "", "/p/b", "/p/c", "/p/d"},
		{"relative path", "loadavg", "/p/b", "/p/c", "/p/d"},
		{"relative fixture path", "./loadavg", "/p/b", "/p/c", "/p/d"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := NewWithPaths(tc.a, tc.b, tc.c, tc.d); !errors.Is(err, ErrBadArgument) {
				t.Errorf("err = %v, want ErrBadArgument", err)
			}
		})
	}
	if _, err := NewWithPaths("/p/a", "/p/b", "/p/c", "/p/d"); err != nil {
		t.Errorf("all-absolute paths must be accepted: %v", err)
	}
}

func TestConcurrentCollect(t *testing.T) {
	c := newTestCollector(t, newFixture(t))
	var wg sync.WaitGroup
	for g := 0; g < 8; g++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < 50; i++ {
				snap, err := c.Collect(context.Background())
				if err != nil {
					t.Errorf("Collect: %v", err)
					return
				}
				if snap.Load.Status != StatusAvailable || snap.CPU.Status != StatusAvailable ||
					snap.Memory.Status != StatusAvailable || snap.IO.Status != StatusAvailable {
					t.Errorf("concurrent snapshot not stable: %+v", snap)
					return
				}
				if snap.Load.Load1 != 3.15 || snap.IO.Some.TotalMicros != 148504042 {
					t.Errorf("concurrent snapshot values corrupted: %+v", snap)
					return
				}
			}
		}()
	}
	wg.Wait()
}

func TestCollectStartsNoGoroutines(t *testing.T) {
	c := newTestCollector(t, newFixture(t))
	if _, err := c.Collect(context.Background()); err != nil {
		t.Fatalf("Collect: %v", err)
	}
	before := runtime.NumGoroutine()
	for i := 0; i < 200; i++ {
		if _, err := c.Collect(context.Background()); err != nil {
			t.Fatalf("Collect: %v", err)
		}
	}
	after := runtime.NumGoroutine()
	if after > before+4 {
		t.Errorf("goroutines grew from %d to %d across 200 passes: "+
			"the package must not start background workers or pollers",
			before, after)
	}
}
