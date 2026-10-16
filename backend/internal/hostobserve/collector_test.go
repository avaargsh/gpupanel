package hostobserve

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

// Fixture contents shared by tests. They mirror the documented real formats.
const (
	validOSRelease = "# managed fixture\n" +
		"NAME=\"Ubuntu\"\n" +
		"ID=ubuntu\n" +
		"VERSION_ID=\"24.04\"\n" +
		"PRETTY_NAME='Ubuntu 24.04.1 LTS'\n" +
		"ANSI_COLOR=\"0;31\"\n"
	validMeminfo = "MemTotal:       16384000 kB\n" +
		"MemFree:         8192000 kB\n" +
		"MemAvailable:   10485760 kB\n" +
		"HugePages_Total:       4\n"
	validUptime = "12345.67 98765.43\n"
)

type fixture struct {
	dir string
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	return &fixture{dir: t.TempDir()}
}

// write creates a fixture file with exactly the given content and returns
// its absolute path. The fixture directory is test-private (t.TempDir), i.e.
// trusted internal configuration, never external request input.
func (f *fixture) write(t *testing.T, name, content string) string {
	t.Helper()
	p := filepath.Join(f.dir, name)
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		t.Fatalf("write fixture %s: %v", name, err)
	}
	return p
}

// collect builds a collector over three written fixtures and collects.
func (f *fixture) collect(t *testing.T, osRelease, meminfo, uptime string) (Snapshot, error) {
	t.Helper()
	c, err := NewWithPaths(
		f.write(t, "os-release", osRelease),
		f.write(t, "meminfo", meminfo),
		f.write(t, "uptime", uptime),
	)
	if err != nil {
		t.Fatalf("NewWithPaths: %v", err)
	}
	return c.Collect(context.Background())
}

func TestCollectValidFixture(t *testing.T) {
	f := newFixture(t)
	// Escaped/quoted os-release: double quotes with escapes, single quotes
	// literal, unquoted literal value, comment and unknown keys.
	osContent := "# comment\n" +
		"NAME=\"Weird \\\"OS\\\" \\\\ \\$HOME\"\n" +
		"ID=debian\n" +
		"VERSION_ID=\"12\"\n" +
		"PRETTY_NAME=\"Line1\\nLine2\\ttab\"\n" +
		"UNKNOWN_KEY='literal \\n stays'\n"
	snap, err := f.collect(t, osContent, validMeminfo, validUptime)
	if err != nil {
		t.Fatalf("Collect: %v", err)
	}

	if snap.OS.Status != StatusAvailable || snap.OS.Err != nil {
		t.Fatalf("OS status = %q err = %v", snap.OS.Status, snap.OS.Err)
	}
	if want := `Weird "OS" \ $HOME`; snap.OS.Name != want {
		t.Errorf("Name = %q, want %q", snap.OS.Name, want)
	}
	if snap.OS.ID != "debian" || snap.OS.VersionID != "12" {
		t.Errorf("ID/VersionID = %q/%q", snap.OS.ID, snap.OS.VersionID)
	}
	if snap.OS.PrettyName != "Line1\nLine2\ttab" {
		t.Errorf("PrettyName = %q", snap.OS.PrettyName)
	}

	if snap.Memory.Status != StatusAvailable {
		t.Fatalf("Memory status = %q err = %v", snap.Memory.Status, snap.Memory.Err)
	}
	if snap.Memory.MemTotalBytes != 16384000*1024 {
		t.Errorf("MemTotalBytes = %d", snap.Memory.MemTotalBytes)
	}
	if snap.Memory.MemAvailableBytes != 10485760*1024 {
		t.Errorf("MemAvailableBytes = %d", snap.Memory.MemAvailableBytes)
	}

	if snap.Uptime.Status != StatusAvailable {
		t.Fatalf("Uptime status = %q err = %v", snap.Uptime.Status, snap.Uptime.Err)
	}
	if snap.Uptime.UptimeSeconds != 12345.67 || snap.Uptime.IdleSeconds != 98765.43 {
		t.Errorf("Uptime = %+v", snap.Uptime)
	}
}

func TestCollectMissingFiles(t *testing.T) {
	f := newFixture(t)
	c, err := NewWithPaths(
		filepath.Join(f.dir, "no-such-os-release"),
		filepath.Join(f.dir, "no-such-meminfo"),
		filepath.Join(f.dir, "no-such-uptime"),
	)
	if err != nil {
		t.Fatalf("NewWithPaths: %v", err)
	}
	snap, err := c.Collect(context.Background())
	if err != nil {
		t.Fatalf("Collect: %v", err)
	}
	for _, s := range []struct {
		name   string
		status Status
		err    error
	}{
		{"OS", snap.OS.Status, snap.OS.Err},
		{"Memory", snap.Memory.Status, snap.Memory.Err},
		{"Uptime", snap.Uptime.Status, snap.Uptime.Err},
	} {
		if s.status != StatusMissing {
			t.Errorf("%s status = %q, want %q", s.name, s.status, StatusMissing)
		}
		if !errors.Is(s.err, ErrMissing) {
			t.Errorf("%s err = %v, want ErrMissing", s.name, s.err)
		}
	}
}

func TestCollectBrokenSymlinkIsMissing(t *testing.T) {
	f := newFixture(t)
	link := filepath.Join(f.dir, "os-release-link")
	if err := os.Symlink(filepath.Join(f.dir, "absent-target"), link); err != nil {
		t.Fatalf("symlink: %v", err)
	}
	c, err := NewWithPaths(link, f.write(t, "meminfo", validMeminfo), f.write(t, "uptime", validUptime))
	if err != nil {
		t.Fatalf("NewWithPaths: %v", err)
	}
	snap, err := c.Collect(context.Background())
	if err != nil {
		t.Fatalf("Collect: %v", err)
	}
	if snap.OS.Status != StatusMissing || !errors.Is(snap.OS.Err, ErrMissing) {
		t.Errorf("OS status = %q err = %v", snap.OS.Status, snap.OS.Err)
	}
	if snap.Memory.Status != StatusAvailable {
		t.Errorf("Memory should stay available, got %q", snap.Memory.Status)
	}
}

func TestCollectEmptyFilesAreMalformed(t *testing.T) {
	f := newFixture(t)
	snap, err := f.collect(t, "", "", "")
	if err != nil {
		t.Fatalf("Collect: %v", err)
	}
	if snap.OS.Status != StatusMalformed || !errors.Is(snap.OS.Err, ErrMalformed) {
		t.Errorf("OS = %q err %v", snap.OS.Status, snap.OS.Err)
	}
	if snap.Memory.Status != StatusMalformed || !errors.Is(snap.Memory.Err, ErrMalformed) {
		t.Errorf("Memory = %q err %v", snap.Memory.Status, snap.Memory.Err)
	}
	if snap.Uptime.Status != StatusMalformed || !errors.Is(snap.Uptime.Err, ErrMalformed) {
		t.Errorf("Uptime = %q err %v", snap.Uptime.Status, snap.Uptime.Err)
	}
}

func TestCollectMissingRequiredFields(t *testing.T) {
	cases := []struct {
		name    string
		content string
	}{
		{"missing NAME", "ID=ubuntu\n"},
		{"missing ID", "NAME=Ubuntu\n"},
		{"empty ID", "NAME=Ubuntu\nID=\n"},
		{"blank ID", "NAME=Ubuntu\nID=\"  \"\n"},
		{"comments only", "# nothing here\n"},
	}
	for _, tc := range cases {
		t.Run("os-release/"+tc.name, func(t *testing.T) {
			f := newFixture(t)
			snap, err := f.collect(t, tc.content, validMeminfo, validUptime)
			if err != nil {
				t.Fatalf("Collect: %v", err)
			}
			if snap.OS.Status != StatusMalformed {
				t.Errorf("status = %q, want %q", snap.OS.Status, StatusMalformed)
			}
			if !errors.Is(snap.OS.Err, ErrMissingField) {
				t.Errorf("err = %v, want ErrMissingField", snap.OS.Err)
			}
			if snap.OS.Name != "" || snap.OS.ID != "" {
				t.Errorf("failed source must expose no identity, got %+v", snap.OS)
			}
		})
	}

	memCases := []struct {
		name    string
		content string
	}{
		{"missing MemTotal", "MemAvailable: 100 kB\n"},
		{"missing MemAvailable", "MemTotal: 100 kB\n"},
	}
	for _, tc := range memCases {
		t.Run("meminfo/"+tc.name, func(t *testing.T) {
			f := newFixture(t)
			snap, err := f.collect(t, validOSRelease, tc.content, validUptime)
			if err != nil {
				t.Fatalf("Collect: %v", err)
			}
			if snap.Memory.Status != StatusMalformed || !errors.Is(snap.Memory.Err, ErrMissingField) {
				t.Errorf("Memory = %q err %v", snap.Memory.Status, snap.Memory.Err)
			}
		})
	}

	t.Run("uptime/missing idle", func(t *testing.T) {
		f := newFixture(t)
		snap, err := f.collect(t, validOSRelease, validMeminfo, "12345.67\n")
		if err != nil {
			t.Fatalf("Collect: %v", err)
		}
		if snap.Uptime.Status != StatusMalformed || !errors.Is(snap.Uptime.Err, ErrMissingField) {
			t.Errorf("Uptime = %q err %v", snap.Uptime.Status, snap.Uptime.Err)
		}
	})
}

func TestCollectPartialAvailability(t *testing.T) {
	f := newFixture(t)
	// OS valid, meminfo absent, uptime malformed: one pass, three outcomes.
	c, err := NewWithPaths(
		f.write(t, "os-release", validOSRelease),
		filepath.Join(f.dir, "absent-meminfo"),
		f.write(t, "uptime", "not-a-number not-a-number\n"),
	)
	if err != nil {
		t.Fatalf("NewWithPaths: %v", err)
	}
	snap, err := c.Collect(context.Background())
	if err != nil {
		t.Fatalf("Collect must not fail on partial availability: %v", err)
	}
	if snap.OS.Status != StatusAvailable || snap.OS.ID != "ubuntu" {
		t.Errorf("OS = %q %+v", snap.OS.Status, snap.OS)
	}
	if snap.Memory.Status != StatusMissing || !errors.Is(snap.Memory.Err, ErrMissing) {
		t.Errorf("Memory = %q err %v", snap.Memory.Status, snap.Memory.Err)
	}
	if snap.Uptime.Status != StatusMalformed || !errors.Is(snap.Uptime.Err, ErrMalformed) {
		t.Errorf("Uptime = %q err %v", snap.Uptime.Status, snap.Uptime.Err)
	}
	if snap.Memory.MemTotalBytes != 0 || snap.Uptime.UptimeSeconds != 0 {
		t.Errorf("failed sources must expose zero payload, got %+v / %+v", snap.Memory, snap.Uptime)
	}
}

func TestCollectUnreadableSource(t *testing.T) {
	f := newFixture(t)
	// A directory opens but cannot be read as a file (EISDIR): the source is
	// unavailable, not missing and not malformed, and no data is invented.
	c, err := NewWithPaths(
		f.write(t, "os-release", validOSRelease),
		f.write(t, "meminfo", validMeminfo),
		f.dir,
	)
	if err != nil {
		t.Fatalf("NewWithPaths: %v", err)
	}
	snap, err := c.Collect(context.Background())
	if err != nil {
		t.Fatalf("Collect: %v", err)
	}
	if snap.Uptime.Status != StatusUnavailable || !errors.Is(snap.Uptime.Err, ErrUnavailable) {
		t.Errorf("Uptime = %q err %v", snap.Uptime.Status, snap.Uptime.Err)
	}
	if snap.OS.Status != StatusAvailable || snap.Memory.Status != StatusAvailable {
		t.Errorf("other sources should stay available: %q %q", snap.OS.Status, snap.Memory.Status)
	}
}

func TestOversizeInputRejectedAndExactBoundAccepted(t *testing.T) {
	// Exact bound (1024 bytes) for /proc/uptime must be readable.
	base := "100.0 50.0\n"
	exact := strings.Repeat(" ", maxUptimeBytes-len(base)) + base
	if len(exact) != maxUptimeBytes {
		t.Fatalf("fixture construction: len = %d", len(exact))
	}
	over := strings.Repeat(" ", maxUptimeBytes-len(base)+1) + base

	f := newFixture(t)
	snap, err := f.collect(t, validOSRelease, validMeminfo, exact)
	if err != nil {
		t.Fatalf("Collect at exact bound: %v", err)
	}
	if snap.Uptime.Status != StatusAvailable || snap.Uptime.UptimeSeconds != 100.0 {
		t.Errorf("exact-bound uptime = %q %+v", snap.Uptime.Status, snap.Uptime)
	}

	snap, err = f.collect(t, validOSRelease, validMeminfo, over)
	if err != nil {
		t.Fatalf("Collect over bound: %v", err)
	}
	if snap.Uptime.Status != StatusUnavailable || !errors.Is(snap.Uptime.Err, ErrTooLarge) {
		t.Errorf("oversize uptime = %q err %v", snap.Uptime.Status, snap.Uptime.Err)
	}
	if snap.Uptime.UptimeSeconds != 0 {
		t.Errorf("oversize content must not be parsed, got %+v", snap.Uptime)
	}

	// Oversize os-release (>16 KiB) is rejected at the read bound too.
	bigOS := validOSRelease + "# " + strings.Repeat("A", maxOSReleaseBytes) + "\n"
	snap, err = f.collect(t, bigOS, validMeminfo, validUptime)
	if err != nil {
		t.Fatalf("Collect oversize os-release: %v", err)
	}
	if snap.OS.Status != StatusUnavailable || !errors.Is(snap.OS.Err, ErrTooLarge) {
		t.Errorf("oversize os-release = %q err %v", snap.OS.Status, snap.OS.Err)
	}
	if snap.OS.Name != "" {
		t.Errorf("oversize os-release must expose no identity, got %q", snap.OS.Name)
	}
}

func TestFailureStatesDistinguishFromSuccessfulZero(t *testing.T) {
	f := newFixture(t)
	// Successful zero: formats valid, values genuinely zero.
	snap, err := f.collect(t, "NAME=Z\nID=z\n", "MemTotal: 0 kB\nMemAvailable: 0 kB\n", "0.00 0.00\n")
	if err != nil {
		t.Fatalf("Collect: %v", err)
	}
	if snap.Uptime.Status != StatusAvailable || snap.Uptime.UptimeSeconds != 0 {
		t.Errorf("zero uptime = %q %v", snap.Uptime.Status, snap.Uptime.UptimeSeconds)
	}
	if snap.Memory.Status != StatusAvailable || snap.Memory.MemTotalBytes != 0 {
		t.Errorf("zero memory = %q %d", snap.Memory.Status, snap.Memory.MemTotalBytes)
	}

	// The three failure states carry the same zero payload but different
	// Status/Err values, so they are never mistaken for a successful zero.
	missing, err := NewWithPaths(filepath.Join(f.dir, "absent"), filepath.Join(f.dir, "absent2"), filepath.Join(f.dir, "absent3"))
	if err != nil {
		t.Fatalf("NewWithPaths: %v", err)
	}
	missingSnap, err := missing.Collect(context.Background())
	if err != nil {
		t.Fatalf("Collect: %v", err)
	}
	malformed, err := f.collect(t, validOSRelease, validMeminfo, "NaN NaN\n")
	if err != nil {
		t.Fatalf("Collect: %v", err)
	}
	unreadable, err := NewWithPaths(f.write(t, "os-release", validOSRelease), f.write(t, "meminfo", validMeminfo), f.dir)
	if err != nil {
		t.Fatalf("NewWithPaths: %v", err)
	}
	unreadableSnap, err := unreadable.Collect(context.Background())
	if err != nil {
		t.Fatalf("Collect: %v", err)
	}

	if missingSnap.Uptime.Status != StatusMissing {
		t.Errorf("missing status = %q", missingSnap.Uptime.Status)
	}
	if malformed.Uptime.Status != StatusMalformed {
		t.Errorf("malformed status = %q", malformed.Uptime.Status)
	}
	if unreadableSnap.Uptime.Status != StatusUnavailable {
		t.Errorf("unavailable status = %q", unreadableSnap.Uptime.Status)
	}
}

func TestNewWithPathsAndNilContextRejected(t *testing.T) {
	abs := "/absolute/path"
	if _, err := NewWithPaths("", abs, abs); !errors.Is(err, ErrBadArgument) {
		t.Errorf("empty path err = %v, want ErrBadArgument", err)
	}
	if _, err := NewWithPaths("relative/os-release", abs, abs); !errors.Is(err, ErrBadArgument) {
		t.Errorf("relative path err = %v, want ErrBadArgument", err)
	}
	var ctx context.Context
	if _, err := New().Collect(ctx); !errors.Is(err, ErrBadArgument) {
		t.Errorf("nil context err = %v, want ErrBadArgument", err)
	}
}

func TestCollectConcurrent(t *testing.T) {
	f := newFixture(t)
	c, err := NewWithPaths(
		f.write(t, "os-release", validOSRelease),
		f.write(t, "meminfo", validMeminfo),
		f.write(t, "uptime", validUptime),
	)
	if err != nil {
		t.Fatalf("NewWithPaths: %v", err)
	}
	var wg sync.WaitGroup
	errs := make(chan string, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			snap, err := c.Collect(context.Background())
			switch {
			case err != nil:
				errs <- "Collect error: " + err.Error()
			case snap.OS.Status != StatusAvailable || snap.Memory.Status != StatusAvailable || snap.Uptime.Status != StatusAvailable:
				errs <- "unexpected statuses"
			}
		}()
	}
	wg.Wait()
	close(errs)
	for msg := range errs {
		t.Error(msg)
	}
}
