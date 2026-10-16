// SPDX-License-Identifier: Apache-2.0

// Package hostmetrics collects bounded, read-only Linux scheduler load and
// pressure-stall metrics for an internal trusted caller.
//
// Scope: exactly four fixed files are ever opened — /proc/loadavg and
// /proc/pressure/{cpu,memory,io}. One Collect call performs one pass; the
// package starts no background goroutine, runs no polling loop, caches
// nothing, executes no shell command, performs no network access and never
// writes host state. There is no HTTP surface: fixture paths are trusted
// internal constructor input, never external request data.
//
// Every source carries its own Status so partial results are observable.
// A missing file (for example /proc/pressure/* on a kernel built without
// CONFIG_PSI) reports StatusMissing and never a successful zero value.
// Cancellation is checked before each bounded read: a pre-cancelled context
// performs no read at all, and cancellation between reads aborts the pass
// with the context error and a zero Snapshot.
//
// Only regular files are accepted: a pre-open os.Stat rejects FIFO, device,
// socket and directory sources before they are opened, and a post-open
// re-check guards against a path swapped in between. The hard read bound is
// enforced with a buffer of compile-time size allocated before any content
// is read, so an oversized file cannot drive unbounded allocation and is
// never parsed.
//
// Numbers are validated as plain finite nonnegative decimals: PSI averages
// must stay within 0..100 percent, PSI totals must fit uint64 microseconds,
// and loadavg task counts must be valid "running/total" pairs with
// running <= total. Invalid content is reported as StatusMalformed with a
// wrapped sentinel error, never silently coerced to zero.
//
// SPDX-License-Identifier: Apache-2.0 is a file-level declaration for these
// original files, expressly requested by the repository owner. It does not
// relicense inherited code or the repository root; see README.md in this
// package for provenance and the remaining rights review.
package hostmetrics

import "errors"

// Default source paths. New() opens only these four files.
const (
	DefaultLoadavgPath        = "/proc/loadavg"
	DefaultCPUPressurePath    = "/proc/pressure/cpu"
	DefaultMemoryPressurePath = "/proc/pressure/memory"
	DefaultIOPressurePath     = "/proc/pressure/io"
)

// Hard read bounds, in bytes. The bound is a compile-time constant and the
// read buffer is allocated as exactly bound+1 bytes before any content is
// read, so an oversized file is rejected without ever being parsed.
const (
	maxLoadavgBytes  = 1 << 10 // real file is < 64 bytes
	maxPressureBytes = 1 << 10 // real file is ~150 bytes
)

// Status describes the outcome of collecting one source.
type Status string

const (
	// StatusAvailable: the file was read within its bound and parsed.
	StatusAvailable Status = "available"
	// StatusMissing: the file does not exist (ENOENT, including broken
	// symlinks). This is the explicit state for, e.g., /proc/pressure/* on
	// a kernel built without CONFIG_PSI; it is never reported as an
	// available zero. Absent required fields inside an existing file are
	// NOT missing: they are malformed content carrying ErrMissingField.
	StatusMissing Status = "missing"
	// StatusUnavailable: the file exists but the bounded read failed
	// (permission, I/O, non-regular source) or the content exceeded the
	// size bound (ErrTooLarge). The content was never parsed.
	StatusUnavailable Status = "unavailable"
	// StatusMalformed: the file was read but its content violates the
	// documented format: absent or empty required fields
	// (ErrMissingField), duplicated fields or lines (ErrDuplicateField),
	// or invalid, out-of-range or overflowing numbers (ErrMalformed).
	StatusMalformed Status = "malformed"
)

// Sentinel errors. Callers classify failures with errors.Is; per-source
// detail is wrapped into Snapshot fields, never logged by this package.
var (
	// ErrMissing wraps ENOENT for a configured source path.
	ErrMissing = errors.New("hostmetrics: source file missing")
	// ErrUnavailable wraps OS-level read/open/stat failures other than
	// ENOENT, including non-regular sources.
	ErrUnavailable = errors.New("hostmetrics: source file unavailable")
	// ErrTooLarge means the content exceeded the hard read bound; it was
	// discarded before parsing.
	ErrTooLarge = errors.New("hostmetrics: source exceeds read bound")
	// ErrMalformed means the content violates the documented format.
	ErrMalformed = errors.New("hostmetrics: source content malformed")
	// ErrMissingField means a required field, value or section was absent
	// or empty.
	ErrMissingField = errors.New("hostmetrics: required field missing")
	// ErrDuplicateField means a required field, line or section appeared
	// more than once.
	ErrDuplicateField = errors.New("hostmetrics: required field duplicated")
	// ErrBadArgument marks invalid internal configuration (empty or
	// relative fixture path, nil context). Fixture paths are trusted
	// constructor input from this module's tests, never request data.
	ErrBadArgument = errors.New("hostmetrics: invalid argument")
)

// Snapshot is the view of one collection pass. Each section carries its own
// Status and Err, so partial availability is observable: err == nil with one
// section missing, unavailable or malformed is a normal, successful result.
type Snapshot struct {
	Load   LoadSnapshot
	CPU    PressureSnapshot
	Memory PressureSnapshot
	IO     PressureSnapshot
}

// LoadSnapshot is the parsed /proc/loadavg view. The numeric fields are
// meaningful only when Status is StatusAvailable; a successful zero load is
// a genuine idle-system value, never a stand-in for a failed read.
type LoadSnapshot struct {
	Status Status
	Err    error
	// Load1, Load5 and Load15 are the 1-, 5- and 15-minute run-queue
	// averages; always finite and >= 0.
	Load1  float64
	Load5  float64
	Load15 float64
	// RunningTasks is the runnable entity count of the "running/total"
	// tasks field; RunningTasks <= TotalTasks holds by construction.
	RunningTasks uint64
	// TotalTasks is the total schedulable entity count of the tasks field.
	TotalTasks uint64
	// LastPID is the PID of the most recently forked process.
	LastPID uint64
}

// PressureSnapshot is the parsed PSI view of one resource (cpu, memory or
// io). The stall fields are meaningful only when Status is
// StatusAvailable; Status StatusMissing is the explicit "PSI absent" state
// and never carries success data.
type PressureSnapshot struct {
	Status Status
	Err    error
	// Some is the "some" line (at least one task stalled).
	Some PressureStall
	// Full is the "full" line (all non-idle tasks stalled).
	Full PressureStall
}

// PressureStall holds one PSI line. Averages are percentages in 0..100;
// TotalMicros is cumulative stall time in microseconds as an exact uint64
// (values beyond uint64 range are rejected as malformed, not wrapped).
type PressureStall struct {
	Avg10Percent  float64
	Avg60Percent  float64
	Avg300Percent float64
	TotalMicros   uint64
}
