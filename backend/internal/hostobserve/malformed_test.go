package hostobserve

import (
	"context"
	"errors"
	"testing"
)

// Malformed-content and numeric-validation cases, exercised through the
// public Collect path so read status mapping is covered together with the
// parsers. Every case leaves the other two sources valid, proving failures
// stay per-source.

func TestMalformedOSRelease(t *testing.T) {
	cases := []struct {
		name    string
		content string
		want    error
	}{
		{"unterminated double quote", "NAME=\"Ubuntu\nID=ubuntu\n", ErrMalformed},
		{"unterminated single quote", "NAME='Ubuntu\nID=ubuntu\n", ErrMalformed},
		{"dangling escape", "NAME=\"Ubuntu\\\nID=ubuntu\n", ErrMalformed},
		{"trailing after closing quote", "NAME=\"Ubuntu\" tail\nID=ubuntu\n", ErrMalformed},
		{"line without assignment", "NAME=Ubuntu\nID=ubuntu\ngarbage-line\n", ErrMalformed},
		{"invalid key", "NAME=Ubuntu\nID=ubuntu\nBAD-KEY=value\n", ErrMalformed},
		{"key with digit start", "NAME=Ubuntu\nID=ubuntu\n1NAME=x\n", ErrMalformed},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newFixture(t)
			snap, err := f.collect(t, tc.content, validMeminfo, validUptime)
			if err != nil {
				t.Fatalf("Collect: %v", err)
			}
			if snap.OS.Status != StatusMalformed {
				t.Errorf("status = %q, want %q", snap.OS.Status, StatusMalformed)
			}
			if !errors.Is(snap.OS.Err, tc.want) {
				t.Errorf("err = %v, want %v", snap.OS.Err, tc.want)
			}
			if snap.OS.Name != "" || snap.OS.ID != "" {
				t.Errorf("malformed source must expose no identity, got %+v", snap.OS)
			}
		})
	}
}

func TestMalformedMeminfoNumbers(t *testing.T) {
	cases := []struct {
		name    string
		content string
	}{
		{"non-numeric", "MemTotal: abc kB\nMemAvailable: 1 kB\n"},
		{"negative", "MemTotal: -1 kB\nMemAvailable: 1 kB\n"},
		{"float", "MemTotal: 1.5 kB\nMemAvailable: 1 kB\n"},
		{"exponent", "MemTotal: 1e6 kB\nMemAvailable: 1 kB\n"},
		{"wrong unit", "MemTotal: 100 KB\nMemAvailable: 1 kB\n"},
		{"missing unit", "MemTotal: 100\nMemAvailable: 1 kB\n"},
		{"empty value", "MemTotal:\nMemAvailable: 1 kB\n"},
		{"line without colon", "MemTotal 100 kB\nMemAvailable: 1 kB\n"},
		{"uint64 range overflow", "MemTotal: 99999999999999999999999 kB\nMemAvailable: 1 kB\n"},
		{"kB conversion overflow", "MemTotal: 18446744073709551615 kB\nMemAvailable: 1 kB\n"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newFixture(t)
			snap, err := f.collect(t, validOSRelease, tc.content, validUptime)
			if err != nil {
				t.Fatalf("Collect: %v", err)
			}
			if snap.Memory.Status != StatusMalformed {
				t.Errorf("status = %q, want %q", snap.Memory.Status, StatusMalformed)
			}
			if !errors.Is(snap.Memory.Err, ErrMalformed) {
				t.Errorf("err = %v, want ErrMalformed", snap.Memory.Err)
			}
			if snap.Memory.MemTotalBytes != 0 || snap.Memory.MemAvailableBytes != 0 {
				t.Errorf("malformed memory must expose zero payload, got %+v", snap.Memory)
			}
		})
	}
}

func TestMalformedUptimeValues(t *testing.T) {
	cases := []struct {
		name    string
		content string
	}{
		{"NaN", "NaN 1.0\n"},
		{"positive infinity", "+Inf 1.0\n"},
		{"infinity", "Inf 1.0\n"},
		{"negative uptime", "-1.0 1.0\n"},
		{"negative idle", "1.0 -1.0\n"},
		{"float overflow to infinity", "1e400 1.0\n"},
		{"junk", "not-a-number 1.0\n"},
		{"trailing fields", "1.0 2.0 3.0\n"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newFixture(t)
			snap, err := f.collect(t, validOSRelease, validMeminfo, tc.content)
			if err != nil {
				t.Fatalf("Collect: %v", err)
			}
			if snap.Uptime.Status != StatusMalformed {
				t.Errorf("status = %q, want %q", snap.Uptime.Status, StatusMalformed)
			}
			if !errors.Is(snap.Uptime.Err, ErrMalformed) {
				t.Errorf("err = %v, want ErrMalformed", snap.Uptime.Err)
			}
			if snap.Uptime.UptimeSeconds != 0 || snap.Uptime.IdleSeconds != 0 {
				t.Errorf("malformed uptime must expose zero payload, got %+v", snap.Uptime)
			}
		})
	}
}

// TestParserDirectContracts pins parser-level contracts that are awkward to
// reach through fixtures (duplicate keys, unknown escapes).
func TestParserDirectContracts(t *testing.T) {
	data, err := parseOSRelease([]byte("NAME=A\nNAME=B\nID=b\n"))
	if err != nil {
		t.Fatalf("parseOSRelease: %v", err)
	}
	if data.name != "B" || data.id != "b" {
		t.Errorf("duplicate key: last assignment should win, got %+v", data)
	}

	data, err = parseOSRelease([]byte("NAME=\"a\\qb\"\nID=x\n"))
	if err != nil {
		t.Fatalf("parseOSRelease: %v", err)
	}
	if data.name != `a\qb` {
		t.Errorf("unknown escape should keep backslash, got %q", data.name)
	}

	if _, err := parseUptime([]byte("1.0 2.0")); err != nil {
		t.Errorf("valid uptime rejected: %v", err)
	}
	if _, err := parseUptime([]byte("   \n")); !errors.Is(err, ErrMalformed) {
		t.Errorf("whitespace-only uptime err = %v, want ErrMalformed", err)
	}
}

// Unused-context guard: Collect never derives data from ctx values; the
// context is only consulted for cancellation.
func TestCollectIgnoresContextValues(t *testing.T) {
	f := newFixture(t)
	c, err := NewWithPaths(
		f.write(t, "os-release", validOSRelease),
		f.write(t, "meminfo", validMeminfo),
		f.write(t, "uptime", validUptime),
	)
	if err != nil {
		t.Fatalf("NewWithPaths: %v", err)
	}
	type ctxKey string
	ctx := context.WithValue(context.Background(), ctxKey("secret"), "should-not-appear")
	snap, err := c.Collect(ctx)
	if err != nil {
		t.Fatalf("Collect: %v", err)
	}
	if snap.OS.ID != "ubuntu" {
		t.Errorf("unexpected snapshot: %+v", snap.OS)
	}
}
