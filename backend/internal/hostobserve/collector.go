package hostobserve

import (
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
)

// Collector reads the three configured host files. It is immutable after
// construction and therefore safe for concurrent Collect calls.
type Collector struct {
	osReleasePath string
	meminfoPath   string
	uptimePath    string
}

// New returns a Collector bound to the default system paths
// (/etc/os-release, /proc/meminfo, /proc/uptime).
func New() *Collector {
	return &Collector{
		osReleasePath: DefaultOSReleasePath,
		meminfoPath:   DefaultMeminfoPath,
		uptimePath:    DefaultUptimePath,
	}
}

// NewWithPaths returns a Collector bound to explicit fixture paths.
//
// Paths are trusted, internal constructor configuration (test fixtures or a
// fixed deploy-time root). They are deliberately not exposed as an external
// API surface: this package has no HTTP handler, and no request data may be
// forwarded here. Both empty and relative paths are rejected so a caller
// cannot silently depend on the process working directory.
func NewWithPaths(osReleasePath, meminfoPath, uptimePath string) (*Collector, error) {
	paths := []string{osReleasePath, meminfoPath, uptimePath}
	for _, p := range paths {
		if p == "" {
			return nil, fmt.Errorf("hostobserve: empty source path: %w", ErrBadArgument)
		}
		if !filepath.IsAbs(p) {
			return nil, fmt.Errorf("hostobserve: source path %q is not absolute: %w", p, ErrBadArgument)
		}
	}
	return &Collector{
		osReleasePath: osReleasePath,
		meminfoPath:   meminfoPath,
		uptimePath:    uptimePath,
	}, nil
}

// Collect reads and parses all three sources and returns their snapshot.
//
// Contract:
//   - Returns a non-nil error only when ctx is cancelled or its deadline
//     expires. The context is checked before every bounded read, so a
//     pre-cancelled context performs no read at all and a cancellation
//     between reads aborts the pass.
//   - A cancelled or aborted pass returns the zero Snapshot and the context
//     error; the caller may retry.
//   - Source-level failures never abort the pass: they are recorded in the
//     matching snapshot section as Status plus a wrapped Err, so partial
//     availability stays observable (err == nil with one section missing or
//     malformed is a normal, successful result).
func (c *Collector) Collect(ctx context.Context) (Snapshot, error) {
	if ctx == nil {
		return Snapshot{}, fmt.Errorf("hostobserve: nil context: %w", ErrBadArgument)
	}

	if err := ctx.Err(); err != nil {
		return Snapshot{}, err
	}
	raw, readErr := readBounded(c.osReleasePath, maxOSReleaseBytes)
	snap := Snapshot{OS: observeOS(raw, readErr)}

	if err := ctx.Err(); err != nil {
		return Snapshot{}, err
	}
	raw, readErr = readBounded(c.meminfoPath, maxMeminfoBytes)
	snap.Memory = observeMeminfo(raw, readErr)

	if err := ctx.Err(); err != nil {
		return Snapshot{}, err
	}
	raw, readErr = readBounded(c.uptimePath, maxUptimeBytes)
	snap.Uptime = observeUptime(raw, readErr)

	return snap, nil
}

// readBounded opens path and reads at most limit bytes.
//
// The read buffer (limit+1 bytes, a compile-time constant) is allocated
// before any I/O happens, so an oversized file can never drive an unbounded
// allocation. Only regular files are accepted: symbolic links are followed
// by os.Open/f.Stat, but FIFO, device, socket and directory sources are
// rejected so a misconfigured path cannot block Collect indefinitely on a
// non-cancellable read.
func readBounded(path string, limit int) ([]byte, error) {
	buf := make([]byte, limit+1)

	f, err := os.Open(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, fmt.Errorf("%s: %w", path, ErrMissing)
		}
		return nil, fmt.Errorf("%s: %w: %v", path, ErrUnavailable, err)
	}
	defer f.Close()

	fi, err := f.Stat()
	if err != nil {
		return nil, fmt.Errorf("%s: %w: %v", path, ErrUnavailable, err)
	}
	if !fi.Mode().IsRegular() {
		return nil, fmt.Errorf("%s: %w: source is not a regular file", path, ErrUnavailable)
	}

	n, err := io.ReadFull(&io.LimitedReader{R: f, N: int64(limit + 1)}, buf)
	switch {
	case err == nil:
		// limit+1 bytes were available: the file exceeds the bound.
		return nil, fmt.Errorf("%s: %w (limit=%d bytes)", path, ErrTooLarge, limit)
	case errors.Is(err, io.EOF), errors.Is(err, io.ErrUnexpectedEOF):
		return buf[:n], nil
	default:
		return nil, fmt.Errorf("%s: %w: %v", path, ErrUnavailable, err)
	}
}

// statusFor maps a read or parse error onto a Status. Parse errors produced
// by this package always wrap ErrMalformed or ErrMissingField.
func statusFor(err error) Status {
	switch {
	case err == nil:
		return StatusAvailable
	case errors.Is(err, ErrMissing):
		return StatusMissing
	case errors.Is(err, ErrMalformed), errors.Is(err, ErrMissingField):
		return StatusMalformed
	default:
		return StatusUnavailable
	}
}

func observeOS(raw []byte, readErr error) OSSnapshot {
	if readErr != nil {
		return OSSnapshot{Status: statusFor(readErr), Err: readErr}
	}
	data, err := parseOSRelease(raw)
	if err != nil {
		return OSSnapshot{Status: statusFor(err), Err: err}
	}
	return OSSnapshot{
		Status:     StatusAvailable,
		Name:       data.name,
		ID:         data.id,
		VersionID:  data.versionID,
		PrettyName: data.prettyName,
	}
}

func observeMeminfo(raw []byte, readErr error) MemorySnapshot {
	if readErr != nil {
		return MemorySnapshot{Status: statusFor(readErr), Err: readErr}
	}
	data, err := parseMeminfo(raw)
	if err != nil {
		return MemorySnapshot{Status: statusFor(err), Err: err}
	}
	return MemorySnapshot{
		Status:            StatusAvailable,
		MemTotalBytes:     data.memTotalBytes,
		MemAvailableBytes: data.memAvailableBytes,
	}
}

func observeUptime(raw []byte, readErr error) UptimeSnapshot {
	if readErr != nil {
		return UptimeSnapshot{Status: statusFor(readErr), Err: readErr}
	}
	data, err := parseUptime(raw)
	if err != nil {
		return UptimeSnapshot{Status: statusFor(err), Err: err}
	}
	return UptimeSnapshot{
		Status:        StatusAvailable,
		UptimeSeconds: data.uptimeSeconds,
		IdleSeconds:   data.idleSeconds,
	}
}
