// SPDX-License-Identifier: Apache-2.0

package hostmetrics

import (
	"fmt"
	"math"
	"strconv"
)

// parseNonnegDecimal parses s as a plain nonnegative decimal number with an
// optional single fraction part (for example "0.52", "12", "100.00").
//
// The character scan runs before strconv and admits only decimal digits and
// at most one '.', with digits required on both sides. Signs, exponents,
// hexadecimal notation, underscores, NaN/Inf spellings, thousands separators
// and empty strings therefore never reach ParseFloat; the strconv call is
// kept only as a range backstop (an all-digit string too long for float64
// yields ErrRange together with ±Inf, both rejected here).
func parseNonnegDecimal(s string) (float64, error) {
	if s == "" {
		return 0, fmt.Errorf("empty number: %w", ErrMalformed)
	}
	dots := 0
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= '0' && c <= '9':
			// digit: acceptable
		case c == '.':
			dots++
			if dots > 1 {
				return 0, fmt.Errorf("%q has more than one decimal point: %w", s, ErrMalformed)
			}
		default:
			return 0, fmt.Errorf("%q is not a plain decimal number: %w", s, ErrMalformed)
		}
	}
	if s[0] == '.' || s[len(s)-1] == '.' {
		return 0, fmt.Errorf("%q lacks digits on both sides of the decimal point: %w", s, ErrMalformed)
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil || math.IsNaN(v) || math.IsInf(v, 0) {
		return 0, fmt.Errorf("%q is not a finite in-range number: %w", s, ErrMalformed)
	}
	return v, nil
}

// parsePercent parses a PSI average: a nonnegative decimal that must also
// stay within 0..100 (the kernel emits stall percentages, never more).
func parsePercent(s string) (float64, error) {
	v, err := parseNonnegDecimal(s)
	if err != nil {
		return 0, err
	}
	if v > 100 {
		return 0, fmt.Errorf("%q exceeds 100 percent: %w", s, ErrMalformed)
	}
	return v, nil
}

// parseUintField parses s as a base-10 unsigned 64-bit integer. Sign
// prefixes, decimal points, exponent notation, empty strings, leading
// underscores (base != 0) and values beyond uint64 range — the PSI total
// microseconds overflow case — are all rejected as malformed.
func parseUintField(s string) (uint64, error) {
	v, err := strconv.ParseUint(s, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("%q is not a valid unsigned integer: %w", s, ErrMalformed)
	}
	return v, nil
}
