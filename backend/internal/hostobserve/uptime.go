package hostobserve

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

// uptimeData is the validated, parsed representation of /proc/uptime.
type uptimeData struct {
	uptimeSeconds float64
	idleSeconds   float64
}

// parseUptime parses the Linux /proc/uptime line "<uptime> <idle>".
//
// Both fields are required finite, non-negative float seconds. NaN, ±Inf,
// negative values, missing fields and unexpected trailing fields are
// ErrMalformed (or ErrMissingField when a field is absent). No cross-check
// between uptime and idle is performed because idle aggregates across CPUs
// and may legitimately exceed the wall-clock uptime.
func parseUptime(raw []byte) (uptimeData, error) {
	var out uptimeData
	fields := strings.Fields(string(raw))
	switch {
	case len(fields) == 0:
		return out, fmt.Errorf("uptime: empty content: %w", ErrMalformed)
	case len(fields) < 2:
		return out, fmt.Errorf("uptime: %w: idle seconds", ErrMissingField)
	case len(fields) > 2:
		return out, fmt.Errorf("uptime: unexpected trailing fields: %w", ErrMalformed)
	}

	up, err := parseSeconds(fields[0], "uptime")
	if err != nil {
		return out, err
	}
	idle, err := parseSeconds(fields[1], "idle")
	if err != nil {
		return out, err
	}
	return uptimeData{uptimeSeconds: up, idleSeconds: idle}, nil
}

// parseSeconds parses one /proc/uptime token, rejecting NaN, infinities and
// negative durations.
func parseSeconds(token, label string) (float64, error) {
	v, err := strconv.ParseFloat(token, 64)
	if err != nil || math.IsNaN(v) || math.IsInf(v, 0) {
		return 0, fmt.Errorf("uptime: invalid %s seconds %q: %w", label, token, ErrMalformed)
	}
	if v < 0 {
		return 0, fmt.Errorf("uptime: negative %s seconds %q: %w", label, token, ErrMalformed)
	}
	return v, nil
}
