// SPDX-License-Identifier: Apache-2.0

package hostmetrics

import (
	"fmt"
	"strconv"
	"strings"
)

// pressureLine is the parsed content of one PSI line.
//
// Format (kernel PSI, Documentation/accounting/psi.rst), two lines per
// file, key=value pairs in the kernel's fixed order (this parser accepts
// any order but requires each key exactly once):
//
//	some avg10=0.00 avg60=0.00 avg300=0.00 total=0
//	full avg10=0.00 avg60=0.00 avg300=0.00 total=0
type pressureLine struct {
	avg10       float64
	avg60       float64
	avg300      float64
	totalMicros uint64
}

// pressureData is the parsed content of one /proc/pressure/{cpu,memory,io}
// file: exactly one "some" line and exactly one "full" line.
type pressureData struct {
	some pressureLine
	full pressureLine
}

// parsePressure parses the raw bytes of one PSI file. The file must contain
// both required lines exactly once each, in either order: a missing line or
// empty content is ErrMissingField, a repeated line is ErrDuplicateField,
// and an unknown label or any other structural violation is ErrMalformed.
func parsePressure(raw []byte) (pressureData, error) {
	var d pressureData
	var seenSome, seenFull bool

	s := strings.TrimSuffix(string(raw), "\n") // at most one trailing newline
	if s == "" {
		return pressureData{}, fmt.Errorf("pressure: empty content: %w", ErrMissingField)
	}
	for _, line := range strings.Split(s, "\n") {
		label, parsed, err := parsePressureLine(line)
		if err != nil {
			return pressureData{}, err
		}
		switch label {
		case "some":
			if seenSome {
				return pressureData{}, fmt.Errorf("pressure: duplicate %q line: %w", label, ErrDuplicateField)
			}
			seenSome, d.some = true, parsed
		case "full":
			if seenFull {
				return pressureData{}, fmt.Errorf("pressure: duplicate %q line: %w", label, ErrDuplicateField)
			}
			seenFull, d.full = true, parsed
		default:
			return pressureData{}, fmt.Errorf("pressure: unknown line label %q: %w", label, ErrMalformed)
		}
	}
	if !seenSome {
		return pressureData{}, fmt.Errorf(`pressure: missing "some" line: %w`, ErrMissingField)
	}
	if !seenFull {
		return pressureData{}, fmt.Errorf(`pressure: missing "full" line: %w`, ErrMissingField)
	}
	return d, nil
}

// parsePressureLine parses one PSI line and returns its label. Every line
// must carry exactly the four required key=value pairs avg10, avg60,
// avg300 and total: an empty value is ErrMissingField, a repeated key is
// ErrDuplicateField, and a token without '=', an unknown key or an invalid
// value is ErrMalformed. Line order and pair order are not constrained.
func parsePressureLine(line string) (string, pressureLine, error) {
	var pl pressureLine
	tokens := strings.Fields(line)
	if len(tokens) == 0 {
		return "", pl, fmt.Errorf("pressure: empty line: %w", ErrMalformed)
	}
	label := tokens[0]
	// Validate the label before anything else on the line: an unknown
	// label is a structural violation (ErrMalformed), not an absent field,
	// no matter what pairs follow it.
	if label != "some" && label != "full" {
		return "", pl, fmt.Errorf("pressure: unknown line label %q: %w", label, ErrMalformed)
	}

	var haveAvg10, haveAvg60, haveAvg300, haveTotal bool
	var err error
	for _, tok := range tokens[1:] {
		key, value, ok := strings.Cut(tok, "=")
		if !ok {
			return "", pl, fmt.Errorf("pressure: %q is not key=value: %w", tok, ErrMalformed)
		}
		if value == "" {
			return "", pl, fmt.Errorf("pressure: field %q has an empty value: %w", key, ErrMissingField)
		}
		switch key {
		case "avg10":
			if haveAvg10 {
				return "", pl, fmt.Errorf("pressure: duplicate field %q: %w", key, ErrDuplicateField)
			}
			if pl.avg10, err = parsePercent(value); err != nil {
				return "", pl, fmt.Errorf("pressure: avg10: %w", err)
			}
			haveAvg10 = true
		case "avg60":
			if haveAvg60 {
				return "", pl, fmt.Errorf("pressure: duplicate field %q: %w", key, ErrDuplicateField)
			}
			if pl.avg60, err = parsePercent(value); err != nil {
				return "", pl, fmt.Errorf("pressure: avg60: %w", err)
			}
			haveAvg60 = true
		case "avg300":
			if haveAvg300 {
				return "", pl, fmt.Errorf("pressure: duplicate field %q: %w", key, ErrDuplicateField)
			}
			if pl.avg300, err = parsePercent(value); err != nil {
				return "", pl, fmt.Errorf("pressure: avg300: %w", err)
			}
			haveAvg300 = true
		case "total":
			if haveTotal {
				return "", pl, fmt.Errorf("pressure: duplicate field %q: %w", key, ErrDuplicateField)
			}
			if pl.totalMicros, err = strconv.ParseUint(value, 10, 64); err != nil {
				return "", pl, fmt.Errorf("pressure: total %q out of uint64 microseconds range or invalid: %w", value, ErrMalformed)
			}
			haveTotal = true
		default:
			return "", pl, fmt.Errorf("pressure: unknown field %q: %w", key, ErrMalformed)
		}
	}
	if !haveAvg10 || !haveAvg60 || !haveAvg300 || !haveTotal {
		return "", pl, fmt.Errorf("pressure: line %q is missing required fields: %w", label, ErrMissingField)
	}
	return label, pl, nil
}
