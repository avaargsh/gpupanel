// SPDX-License-Identifier: Apache-2.0

package hostmetrics

import (
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
)

// Collector reads the four configured host metric files. It is immutable
// after construction (the unexported open seam included) and therefore safe
// for concurrent Collect calls.
type Collector struct {
	loadavgPath string
	cpuPath     string
	memoryPath  string
	ioPath      string

	// open opens a source file. Both production constructors set os.Open.
	// Tests in this package replace it on their own instance to count
	// opens and prove the cancellation ordering; it is unexported, never
	// derived from external input, and always set before first use, so
	// concurrent Collect calls only ever read it.
	open func(string) (*os.File, error)
}

// New returns a Collector bound to the default system paths
// (/proc/loadavg and /proc/pressure/{cpu,memory,io}).
func New() *Collector {
	return &Collector{
		loadavgPath: DefaultLoadavgPath,
		cpuPath:     DefaultCPUPressurePath,
		memoryPath:  DefaultMemoryPressurePath,
		ioPath:      DefaultIOPressurePath,
		open:        os.Open,
	}
}

// NewWithPaths returns a Collector bound to explicit fixture paths.
//
// Paths are trusted, internal constructor configuration (test fixtures or a
// fixed deploy-time root). They are deliberately not exposed as an external
// API surface: this package has no HTTP handler, and no request data may be
// forwarded here. Both empty and relative paths are rejected so a caller
// cannot silently depend on the process working directory.
func NewWithPaths(loadavgPath, cpuPath, memoryPath, ioPath string) (*Collector, error) {
	paths := []string{loadavgPath, cpuPath, memoryPath, ioPath}
	for _, p := range paths {
		if p == "" {
			return nil, fmt.Errorf("hostmetrics: empty source path: %w", ErrBadArgument)
		}
		if !filepath.IsAbs(p) {
			return nil, fmt.Errorf("hostmetrics: source path %q is not absolute: %w", p, ErrBadArgument)
		}
	}
	return &Collector{
		loadavgPath: loadavgPath,
		cpuPath:     cpuPath,
		memoryPath:  memoryPath,
		ioPath:      ioPath,
		open:        os.Open,
	}, nil
}

// Collect reads and parses all four sources and returns their snapshot.
//
// Contract:
//   - Returns a non-nil error only when ctx is nil, or ctx is cancelled or
//     its deadline expires. ctx.Err() is checked once before each of the
//     four bounded reads, so a pre-cancelled context performs no read at
//     all and a cancellation between reads aborts the pass.
//   - A cancelled or aborted pass returns the zero Snapshot and the
//     context error; the caller may retry.
//   - Source-level failures never abort the pass: they are recorded in the
//     matching snapshot section as Status plus a wrapped Err, so partial
//     availability stays observable (err == nil with one section missing,
//     unavailable or malformed is a normal, successful result).
//   - No goroutine is started and no state is retained after the call.
func (c *Collector) Collect(ctx context.Context) (Snapshot, error) {
	if ctx == nil {
		return Snapshot{}, fmt.Errorf("hostmetrics: nil context: %w", ErrBadArgument)
	}

	if err := ctx.Err(); err != nil {
		return Snapshot{}, err
	}
	raw, readErr := c.readBounded(c.loadavgPath, maxLoadavgBytes)
	snap := Snapshot{Load: observeLoad(raw, readErr)}

	if err := ctx.Err(); err != nil {
		return Snapshot{}, err
	}
	raw, readErr = c.readBounded(c.cpuPath, maxPressureBytes)
	snap.CPU = observePressure(raw, readErr)

	if err := ctx.Err(); err != nil {
		return Snapshot{}, err
	}
	raw, readErr = c.readBounded(c.memoryPath, maxPressureBytes)
	snap.Memory = observePressure(raw, readErr)

	if err := ctx.Err(); err != nil {
		return Snapshot{}, err
	}
	raw, readErr = c.readBounded(c.ioPath, maxPressureBytes)
	snap.IO = observePressure(raw, readErr)

	return snap, nil
}

// readBounded opens path and reads at most limit bytes.
//
// The regular source is established twice: os.Stat before the open rejects
// FIFO, device, socket and directory paths without ever calling open (a
// FIFO open can block and the open itself is not context-cancellable), and
// f.Stat after the open guards a path swapped in between the two checks.
// os.Stat follows symbolic links, so a symlink to a regular file stays
// acceptable.
//
// The read buffer (limit+1 bytes, a compile-time constant) is allocated
// before any content is read, so an oversized file can never drive an
// unbounded allocation and never reaches a parser.
func (c *Collector) readBounded(path string, limit int) ([]byte, error) {
	buf := make([]byte, limit+1)

	if fi, err := os.Stat(path); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, fmt.Errorf("%s: %w", path, ErrMissing)
		}
		return nil, fmt.Errorf("%s: %w: %v", path, ErrUnavailable, err)
	} else if !fi.Mode().IsRegular() {
		return nil, fmt.Errorf("%s: %w: source is not a regular file", path, ErrUnavailable)
	}

	f, err := c.open(path)
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
// by this package always wrap ErrMalformed, ErrMissingField or
// ErrDuplicateField.
func statusFor(err error) Status {
	switch {
	case err == nil:
		return StatusAvailable
	case errors.Is(err, ErrMissing):
		return StatusMissing
	case errors.Is(err, ErrMalformed), errors.Is(err, ErrMissingField),
		errors.Is(err, ErrDuplicateField):
		return StatusMalformed
	default:
		return StatusUnavailable
	}
}

func observeLoad(raw []byte, readErr error) LoadSnapshot {
	if readErr != nil {
		return LoadSnapshot{Status: statusFor(readErr), Err: readErr}
	}
	data, err := parseLoadavg(raw)
	if err != nil {
		return LoadSnapshot{Status: statusFor(err), Err: err}
	}
	return LoadSnapshot{
		Status:       StatusAvailable,
		Load1:        data.load1,
		Load5:        data.load5,
		Load15:       data.load15,
		RunningTasks: data.running,
		TotalTasks:   data.total,
		LastPID:      data.lastPID,
	}
}

func observePressure(raw []byte, readErr error) PressureSnapshot {
	if readErr != nil {
		return PressureSnapshot{Status: statusFor(readErr), Err: readErr}
	}
	data, err := parsePressure(raw)
	if err != nil {
		return PressureSnapshot{Status: statusFor(err), Err: err}
	}
	return PressureSnapshot{
		Status: StatusAvailable,
		Some: PressureStall{
			Avg10Percent:  data.some.avg10,
			Avg60Percent:  data.some.avg60,
			Avg300Percent: data.some.avg300,
			TotalMicros:   data.some.totalMicros,
		},
		Full: PressureStall{
			Avg10Percent:  data.full.avg10,
			Avg60Percent:  data.full.avg60,
			Avg300Percent: data.full.avg300,
			TotalMicros:   data.full.totalMicros,
		},
	}
}
