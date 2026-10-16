// Package hostobserve provides a minimal, read-only Linux host observer.
//
// It reads exactly three files (/etc/os-release, /proc/meminfo, /proc/uptime),
// applies a hard size bound before allocating any buffer, honours context
// cancellation before and between reads, and reports missing, unavailable or
// malformed sources explicitly instead of returning zero values that look
// like successful data.
//
// Only regular files are accepted: symbolic links are followed, but FIFO,
// device, socket and directory sources are rejected so a misconfigured path
// cannot block Collect indefinitely on a non-cancellable read. For regular
// files the bounded read is fast and complete, so checking the context before
// each read provides effective cancellation for the default system paths.
//
// The package never executes shell commands, never reads environment
// variables, process tables, credentials or user configuration, and never
// writes system state.
package hostobserve

import "errors"

// Default source paths. Only these three files are ever opened by the
// default collector.
const (
	DefaultOSReleasePath = "/etc/os-release"
	DefaultMeminfoPath   = "/proc/meminfo"
	DefaultUptimePath    = "/proc/uptime"
)

// Hard read bounds, in bytes. The bound is a compile-time constant and the
// read buffer is allocated as exactly bound+1 bytes before any I/O happens,
// so an oversized file can never drive an unbounded allocation.
const (
	maxOSReleaseBytes = 16 << 10 // real files are a few KiB
	maxMeminfoBytes   = 16 << 10 // real files are ~1.5 KiB
	maxUptimeBytes    = 1 << 10  // real file is < 100 bytes
)

// Status describes the outcome of collecting one source.
//
// StatusAvailable with a zero-valued payload is a genuine successful zero
// (for example an uptime of 0.00 seconds on a fresh boot); it is never used
// to paper over a failed read.
type Status string

const (
	// StatusAvailable: the file was read within its bound and parsed.
	StatusAvailable Status = "available"
	// StatusMissing: the file does not exist (ENOENT, including broken
	// symlinks). Required-field absence is NOT "missing"; it is malformed
	// content carrying ErrMissingField.
	StatusMissing Status = "missing"
	// StatusUnavailable: the file exists but the bounded read failed
	// (permission, I/O error, is-a-directory) or violated the size bound
	// (ErrTooLarge). The content was never parsed.
	StatusUnavailable Status = "unavailable"
	// StatusMalformed: the file was read but its content is not valid for
	// our documented format, including absent required fields
	// (ErrMissingField) and invalid or out-of-range numbers (ErrMalformed).
	StatusMalformed Status = "malformed"
)

// Sentinel errors. Callers classify failures with errors.Is; per-source
// details are wrapped into Snapshot fields, never into logs or output by
// this package itself.
var (
	// ErrMissing wraps ENOENT for a configured source path.
	ErrMissing = errors.New("hostobserve: source file missing")
	// ErrUnavailable wraps OS-level read/open failures other than ENOENT.
	ErrUnavailable = errors.New("hostobserve: source file unavailable")
	// ErrTooLarge means the file exceeded its hard read bound; the content
	// was discarded before parsing.
	ErrTooLarge = errors.New("hostobserve: source exceeds read bound")
	// ErrMalformed means the content violates the documented format.
	ErrMalformed = errors.New("hostobserve: source content malformed")
	// ErrMissingField means a required field was absent or empty.
	ErrMissingField = errors.New("hostobserve: required field missing")
	// ErrBadArgument marks invalid internal configuration (empty/relative
	// fixture path, nil context). Fixture paths are trusted constructor
	// input from this module's tests, never external request data.
	ErrBadArgument = errors.New("hostobserve: invalid argument")
)

// Snapshot is the returned view of one collection pass. It exposes only
// non-sensitive OS identity, memory and uptime data. Each section carries
// its own Status and Err so partial availability is observable.
type Snapshot struct {
	OS     OSSnapshot
	Memory MemorySnapshot
	Uptime UptimeSnapshot
}

// OSSnapshot is the parsed, non-sensitive OS identity view.
type OSSnapshot struct {
	Status Status
	Err    error
	// Name is the NAME field (for example "Ubuntu").
	Name string
	// ID is the ID field (for example "ubuntu").
	ID string
	// VersionID is the VERSION_ID field; empty if the source omits it.
	VersionID string
	// PrettyName is the PRETTY_NAME field; empty if the source omits it.
	PrettyName string
}

// MemorySnapshot is the parsed, non-sensitive memory view. Both byte counts
// are meaningful only when Status is StatusAvailable.
type MemorySnapshot struct {
	Status Status
	Err    error
	// MemTotalBytes is MemTotal converted from kB to bytes, or zero.
	MemTotalBytes uint64
	// MemAvailableBytes is MemAvailable converted from kB to bytes, or zero.
	MemAvailableBytes uint64
}

// UptimeSnapshot is the parsed, non-sensitive uptime view. Both durations
// are meaningful only when Status is StatusAvailable.
type UptimeSnapshot struct {
	Status Status
	Err    error
	// UptimeSeconds is the seconds field of /proc/uptime.
	UptimeSeconds float64
	// IdleSeconds is the aggregated idle-seconds field of /proc/uptime.
	IdleSeconds float64
}
