// SPDX-License-Identifier: Apache-2.0

package hostmetrics

import (
	"fmt"
	"strings"
)

// loadavgData is the parsed content of one /proc/loadavg file.
//
// Format (proc(5), single line, whitespace-separated):
//
//	<load1> <load5> <load15> <running>/<total> <lastpid>
//
// The kernel prints the three averages as unsigned integer plus two decimal
// digits (for example "0.52"); this parser accepts any plain nonnegative
// decimal instead of pinning the exact digit count, but still rejects
// everything outside that character domain.
type loadavgData struct {
	load1   float64
	load5   float64
	load15  float64
	running uint64
	total   uint64
	lastPID uint64
}

// parseLoadavg parses the raw bytes of /proc/loadavg. Exactly five fields
// are required on exactly one line: fewer fields (or an empty file) is
// ErrMissingField, more fields or a second line is ErrMalformed, and any
// invalid number or task count is ErrMalformed.
func parseLoadavg(raw []byte) (loadavgData, error) {
	var d loadavgData
	s := string(raw)
	s = strings.TrimSuffix(s, "\n") // at most one trailing newline is allowed
	if s == "" {
		return loadavgData{}, fmt.Errorf("loadavg: empty content: %w", ErrMissingField)
	}
	if strings.Contains(s, "\n") {
		return loadavgData{}, fmt.Errorf("loadavg: content must be a single line: %w", ErrMalformed)
	}
	fields := strings.Fields(s)
	if len(fields) < 5 {
		return loadavgData{}, fmt.Errorf("loadavg: %d of 5 required fields: %w", len(fields), ErrMissingField)
	}
	if len(fields) > 5 {
		return loadavgData{}, fmt.Errorf("loadavg: unexpected extra fields: %w", ErrMalformed)
	}

	var err error
	if d.load1, err = parseNonnegDecimal(fields[0]); err != nil {
		return loadavgData{}, fmt.Errorf("loadavg: 1-minute load: %w", err)
	}
	if d.load5, err = parseNonnegDecimal(fields[1]); err != nil {
		return loadavgData{}, fmt.Errorf("loadavg: 5-minute load: %w", err)
	}
	if d.load15, err = parseNonnegDecimal(fields[2]); err != nil {
		return loadavgData{}, fmt.Errorf("loadavg: 15-minute load: %w", err)
	}
	if d.running, d.total, err = parseTasks(fields[3]); err != nil {
		return loadavgData{}, fmt.Errorf("loadavg: tasks field: %w", err)
	}
	if d.lastPID, err = parseUintField(fields[4]); err != nil {
		return loadavgData{}, fmt.Errorf("loadavg: last pid: %w", err)
	}
	return d, nil
}

// parseTasks parses the "running/total" field of /proc/loadavg.
//
// Both counts must be nonnegative base-10 integers (rejected: negative
// signs, decimals, garbage, uint64 overflow) and running must not exceed
// total: runnable entities are a subset of existing entities, so the
// opposite cannot describe a valid kernel state. A missing separator or
// empty side is ErrMissingField; too many separators, unparseable counts
// and running > total are ErrMalformed.
func parseTasks(field string) (running, total uint64, err error) {
	parts := strings.Split(field, "/")
	if len(parts) == 1 {
		return 0, 0, fmt.Errorf("missing %q separator: %w", "/", ErrMissingField)
	}
	if len(parts) > 2 {
		return 0, 0, fmt.Errorf("too many %q separators: %w", "/", ErrMalformed)
	}
	if parts[0] == "" {
		return 0, 0, fmt.Errorf("empty running count: %w", ErrMissingField)
	}
	if parts[1] == "" {
		return 0, 0, fmt.Errorf("empty total count: %w", ErrMissingField)
	}
	if running, err = parseUintField(parts[0]); err != nil {
		return 0, 0, fmt.Errorf("running count: %w", err)
	}
	if total, err = parseUintField(parts[1]); err != nil {
		return 0, 0, fmt.Errorf("total count: %w", err)
	}
	if running > total {
		return 0, 0, fmt.Errorf("running %d exceeds total %d: %w", running, total, ErrMalformed)
	}
	return running, total, nil
}
