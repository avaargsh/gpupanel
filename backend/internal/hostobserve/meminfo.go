package hostobserve

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

// meminfoData is the validated, parsed representation of the fields we
// consume from /proc/meminfo. Values are already converted to bytes.
type meminfoData struct {
	memTotalBytes     uint64
	memAvailableBytes uint64
}

// parseMeminfo parses /proc/meminfo lines of the form "Key: <uint> kB".
//
// Only MemTotal and MemAvailable are consumed; both are required (a kernel
// without either cannot satisfy our documented view, and silently reporting
// zero memory would be a lie). Other lines (including unit-less ones such as
// HugePages_Total) are skipped. Each target line must carry an integer value
// in kB; negative, non-numeric, out-of-range or kB-conversion-overflowing
// values are ErrMalformed rather than a plausible-looking zero. Duplicate
// target keys: last line wins.
func parseMeminfo(raw []byte) (meminfoData, error) {
	var out meminfoData
	if len(raw) == 0 {
		return out, fmt.Errorf("meminfo: empty content: %w", ErrMalformed)
	}

	var haveTotal, haveAvailable bool
	for i, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSuffix(line, "\r")
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		key, rest, found := strings.Cut(trimmed, ":")
		if !found {
			return out, fmt.Errorf("meminfo: line %d: expected \"Key: value kB\": %w", i+1, ErrMalformed)
		}
		key = strings.TrimSpace(key)
		if key != "MemTotal" && key != "MemAvailable" {
			continue
		}

		tokens := strings.Fields(rest)
		if len(tokens) != 2 || tokens[1] != "kB" {
			return out, fmt.Errorf("meminfo: line %d (%s): expected \"<uint> kB\": %w", i+1, key, ErrMalformed)
		}
		// ParseUint rejects signs (negative values) and non-numeric input;
		// ErrRange covers integer overflow beyond uint64.
		kb, err := strconv.ParseUint(tokens[0], 10, 64)
		if err != nil {
			return out, fmt.Errorf("meminfo: line %d (%s): invalid value %q: %w", i+1, key, tokens[0], ErrMalformed)
		}
		if kb > math.MaxUint64/1024 {
			return out, fmt.Errorf("meminfo: line %d (%s): byte conversion overflows: %w", i+1, key, ErrMalformed)
		}
		switch key {
		case "MemTotal":
			out.memTotalBytes = kb * 1024
			haveTotal = true
		case "MemAvailable":
			out.memAvailableBytes = kb * 1024
			haveAvailable = true
		}
	}

	if !haveTotal {
		return out, fmt.Errorf("meminfo: %w: MemTotal", ErrMissingField)
	}
	if !haveAvailable {
		return out, fmt.Errorf("meminfo: %w: MemAvailable", ErrMissingField)
	}
	return out, nil
}
