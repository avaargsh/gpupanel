// SPDX-License-Identifier: Apache-2.0

package hostmetrics

import (
	"errors"
	"strings"
	"testing"
)

// Pure-parser table tests: valid formats must round-trip to exact values,
// and every adversarial or malformed input must be rejected with the right
// sentinel (errors.Is), never coerced to zero.

func TestParseLoadavgValid(t *testing.T) {
	for _, tc := range []struct {
		name, in string
		want     loadavgData
	}{
		{"kernel sample", "3.15 2.12 1.72 13/2696 859144\n", loadavgData{
			load1: 3.15, load5: 2.12, load15: 1.72, running: 13, total: 2696, lastPID: 859144}},
		{"no trailing newline", "0.10 0.20 0.30 1/2 7", loadavgData{
			load1: 0.10, load5: 0.20, load15: 0.30, running: 1, total: 2, lastPID: 7}},
		{"idle zeros", "0.00 0.00 0.00 0/0 0\n", loadavgData{}},
		{"plain integer form", "5 4 3 2/8 9\n", loadavgData{
			load1: 5, load5: 4, load15: 3, running: 2, total: 8, lastPID: 9}},
		{"large loads and counts", "184467.00 1000000.50 12.99 4096/65536 4194304\n",
			loadavgData{load1: 184467, load5: 1000000.50, load15: 12.99,
				running: 4096, total: 65536, lastPID: 4194304}},
		{"extra whitespace and tab separators", "  0.50   0.60\t0.70 1/2 7 \n", loadavgData{
			load1: 0.50, load5: 0.60, load15: 0.70, running: 1, total: 2, lastPID: 7}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parseLoadavg([]byte(tc.in))
			if err != nil {
				t.Fatalf("parseLoadavg(%q) error: %v", tc.in, err)
			}
			if got != tc.want {
				t.Errorf("parseLoadavg(%q) = %+v, want %+v", tc.in, got, tc.want)
			}
		})
	}
}

func TestParseLoadavgInvalid(t *testing.T) {
	huge := strings.Repeat("9", 400) // float64 range overflow via all-digits
	for _, tc := range []struct {
		name, in string
		wantErr  error
	}{
		{"empty content", "", ErrMissingField},
		{"newline only", "\n", ErrMissingField},
		{"single field", "0.50\n", ErrMissingField},
		{"four fields", "0.50 0.60 0.70 1/2\n", ErrMissingField},
		{"six fields", "0.50 0.60 0.70 1/2 78 9\n", ErrMalformed},
		{"two lines", "0.50 0.60 0.70 1/2 7\n0.10 0.20 0.30 1/1 8\n", ErrMalformed},
		{"blank second line", "0.50 0.60 0.70 1/2 7\n\n", ErrMalformed},
		{"nan", "NaN 0.60 0.70 1/2 7\n", ErrMalformed},
		{"inf", "Inf 0.60 0.70 1/2 7\n", ErrMalformed},
		{"negative load", "-1.00 0.60 0.70 1/2 7\n", ErrMalformed},
		{"exponent notation", "1e3 0.60 0.70 1/2 7\n", ErrMalformed},
		{"hex float", "0x1p0 0.60 0.70 1/2 7\n", ErrMalformed},
		{"underscore literal", "0_0 0.60 0.70 1/2 7\n", ErrMalformed},
		{"word", "abc 0.60 0.70 1/2 7\n", ErrMalformed},
		{"nul byte", "0.5\x00 0.60 0.70 1/2 7\n", ErrMalformed},
		{"leading dot", ".5 0.60 0.70 1/2 7\n", ErrMalformed},
		{"trailing dot", "5. 0.60 0.70 1/2 7\n", ErrMalformed},
		{"two dots", "1.2.3 0.60 0.70 1/2 7\n", ErrMalformed},
		{"float range overflow", huge + " 0.60 0.70 1/2 7\n", ErrMalformed},
		{"tasks not numeric", "0.50 0.60 0.70 x/2 7\n", ErrMalformed},
		{"tasks negative running", "0.50 0.60 0.70 -1/2 7\n", ErrMalformed},
		{"tasks decimal", "0.50 0.60 0.70 1.5/2 7\n", ErrMalformed},
		{"tasks missing separator", "0.50 0.60 0.70 2 7\n", ErrMissingField},
		{"tasks empty running", "0.50 0.60 0.70 /2 7\n", ErrMissingField},
		{"tasks empty total", "0.50 0.60 0.70 1/ 7\n", ErrMissingField},
		{"tasks double separator", "0.50 0.60 0.70 1/2/3 7\n", ErrMalformed},
		{"tasks running exceeds total", "0.50 0.60 0.70 8/5 7\n", ErrMalformed},
		{"tasks uint64 overflow", "0.50 0.60 0.70 1/18446744073709551616 7\n", ErrMalformed},
		{"pid garbage", "0.50 0.60 0.70 1/2 x\n", ErrMalformed},
		{"pid negative", "0.50 0.60 0.70 1/2 -7\n", ErrMalformed},
		{"pid overflow", "0.50 0.60 0.70 1/2 18446744073709551616\n", ErrMalformed},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parseLoadavg([]byte(tc.in))
			if err == nil {
				t.Fatalf("parseLoadavg(%q) = %+v, want error %v", tc.in, got, tc.wantErr)
			}
			if !errors.Is(err, tc.wantErr) {
				t.Errorf("parseLoadavg(%q) err = %v, want %v", tc.in, err, tc.wantErr)
			}
			if got != (loadavgData{}) {
				t.Errorf("rejected input must not leak values: %+v", got)
			}
		})
	}
}

const (
	someLine = "some avg10=1.00 avg60=2.00 avg300=3.00 total=4"
	fullLine = "full avg10=0.00 avg60=0.00 avg300=0.00 total=0"
)

func TestParsePressureValid(t *testing.T) {
	maxUint := "18446744073709551615"
	for _, tc := range []struct {
		name, in string
		want     pressureData
	}{
		{"kernel sample", "some avg10=0.06 avg60=0.03 avg300=0.00 total=266158139\n" +
			"full avg10=0.00 avg60=0.00 avg300=0.00 total=0\n", pressureData{
			some: pressureLine{avg10: 0.06, avg60: 0.03, avg300: 0, totalMicros: 266158139}}},
		{"line order reversed", fullLine + "\n" + someLine + "\n", pressureData{
			some: pressureLine{avg10: 1, avg60: 2, avg300: 3, totalMicros: 4}}},
		{"pair order shuffled with extra spaces", "some   total=5 avg10=1.00 avg300=2.00 avg60=3.00\n" +
			fullLine + "\n", pressureData{
			some: pressureLine{avg10: 1, avg60: 3, avg300: 2, totalMicros: 5}}},
		{"boundaries 100 percent and uint64 max",
			"some avg10=100.00 avg60=100.00 avg300=100.00 total=" + maxUint + "\n" +
				"full avg10=100.00 avg60=100.00 avg300=100.00 total=" + maxUint + "\n",
			pressureData{
				some: pressureLine{avg10: 100, avg60: 100, avg300: 100, totalMicros: ^uint64(0)},
				full: pressureLine{avg10: 100, avg60: 100, avg300: 100, totalMicros: ^uint64(0)}}},
		{"no trailing newline", someLine + "\n" + fullLine, pressureData{
			some: pressureLine{avg10: 1, avg60: 2, avg300: 3, totalMicros: 4}}},
		{"high precision within range", "some avg10=0.123456789012 avg60=0 avg300=99.9999 total=1\n" +
			"full avg10=0 avg60=0 avg300=0 total=0\n", pressureData{
			some: pressureLine{avg10: 0.123456789012, avg300: 99.9999, totalMicros: 1}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parsePressure([]byte(tc.in))
			if err != nil {
				t.Fatalf("parsePressure(%q) error: %v", tc.in, err)
			}
			if got != tc.want {
				t.Errorf("parsePressure(%q) = %+v, want %+v", tc.in, got, tc.want)
			}
		})
	}
}

func TestParsePressureInvalid(t *testing.T) {
	for _, tc := range []struct {
		name, in string
		wantErr  error
	}{
		{"empty content", "", ErrMissingField},
		{"newline only", "\n", ErrMissingField},
		{"some line only", someLine + "\n", ErrMissingField},
		{"full line only", fullLine + "\n", ErrMissingField},
		{"duplicate some line", someLine + "\n" + someLine + "\n" + fullLine + "\n", ErrDuplicateField},
		{"duplicate full line", someLine + "\n" + fullLine + "\n" + fullLine + "\n", ErrDuplicateField},
		{"unknown third line", someLine + "\n" + fullLine + "\n" + "weird avg10=0.00\n", ErrMalformed},
		{"blank interior line", someLine + "\n\n" + fullLine + "\n", ErrMalformed},
		{"unknown label", "meh avg10=0.00\n" + fullLine + "\n", ErrMalformed},
		{"uppercase label", "SOME avg10=0.00\n" + fullLine + "\n", ErrMalformed},
		{"label missing values", "some\n" + fullLine + "\n", ErrMissingField},
		{"missing avg60", "some avg10=0.00 avg300=0.00 total=0\n" + fullLine + "\n", ErrMissingField},
		{"missing total", "some avg10=0.00 avg60=0.00 avg300=0.00\n" + fullLine + "\n", ErrMissingField},
		{"duplicate avg10", "some avg10=0.00 avg10=1.00 avg60=0.00 avg300=0.00 total=0\n" +
			fullLine + "\n", ErrDuplicateField},
		{"duplicate total", "some avg10=0.00 avg60=0.00 avg300=0.00 total=0 total=1\n" +
			fullLine + "\n", ErrDuplicateField},
		{"unknown field", "some avg10=0.00 avg60=0.00 avg300=0.00 total=0 bogus=1\n" +
			fullLine + "\n", ErrMalformed},
		{"token without equals", "some avg10=0.00 avg60=0.00 avg300=0.00 total=0 junk\n" +
			fullLine + "\n", ErrMalformed},
		{"empty avg value", "some avg10= avg60=0.00 avg300=0.00 total=0\n" +
			fullLine + "\n", ErrMissingField},
		{"empty total value", "some avg10=0.00 avg60=0.00 avg300=0.00 total=\n" +
			fullLine + "\n", ErrMissingField},
		{"percent just over 100", "some avg10=100.01 avg60=0.00 avg300=0.00 total=0\n" +
			fullLine + "\n", ErrMalformed},
		{"percent absurdly over 100", "some avg10=100000 avg60=0.00 avg300=0.00 total=0\n" +
			fullLine + "\n", ErrMalformed},
		{"negative percent", "some avg10=-0.01 avg60=0.00 avg300=0.00 total=0\n" +
			fullLine + "\n", ErrMalformed},
		{"nan percent", "some avg10=NaN avg60=0.00 avg300=0.00 total=0\n" +
			fullLine + "\n", ErrMalformed},
		{"inf percent", "some avg10=+Inf avg60=0.00 avg300=0.00 total=0\n" +
			fullLine + "\n", ErrMalformed},
		{"exponent percent", "some avg10=1e1 avg60=0.00 avg300=0.00 total=0\n" +
			fullLine + "\n", ErrMalformed},
		{"negative total", "some avg10=0.00 avg60=0.00 avg300=0.00 total=-1\n" +
			fullLine + "\n", ErrMalformed},
		{"decimal total", "some avg10=0.00 avg60=0.00 avg300=0.00 total=1.5\n" +
			fullLine + "\n", ErrMalformed},
		{"total uint64 overflow", "some avg10=0.00 avg60=0.00 avg300=0.00 total=18446744073709551616\n" +
			fullLine + "\n", ErrMalformed},
		{"total word", "some avg10=0.00 avg60=0.00 avg300=0.00 total=lots\n" +
			fullLine + "\n", ErrMalformed},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parsePressure([]byte(tc.in))
			if err == nil {
				t.Fatalf("parsePressure(%q) = %+v, want error %v", tc.in, got, tc.wantErr)
			}
			if !errors.Is(err, tc.wantErr) {
				t.Errorf("parsePressure(%q) err = %v, want %v", tc.in, err, tc.wantErr)
			}
			if got != (pressureData{}) {
				t.Errorf("rejected input must not leak values: %+v", got)
			}
		})
	}
}
