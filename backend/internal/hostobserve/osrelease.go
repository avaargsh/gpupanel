package hostobserve

import (
	"fmt"
	"strings"
)

// osReleaseData is the parsed representation of /etc/os-release, kept
// separate from both the raw bytes and the returned Snapshot view. It is
// validated: NAME and ID are present and non-blank when parsing succeeds.
type osReleaseData struct {
	name       string
	id         string
	versionID  string
	prettyName string
}

// parseOSRelease parses shell-style KEY=VALUE assignments per os-release(5).
//
// Rules (defensive, documented):
//   - blank lines and lines starting with '#' are skipped;
//   - every other line must be KEY=VALUE with a valid shell identifier key;
//   - single-quoted values are literal, double-quoted values decode the
//     escapes \n \t \r \\ \" \' \` \$ (unknown escapes keep the backslash),
//     unquoted values are taken literally;
//   - no variable or environment expansion of any kind is performed;
//   - duplicate keys: last assignment wins;
//   - NAME and ID are required and must be non-blank, otherwise
//     ErrMissingField; any structural violation is ErrMalformed.
func parseOSRelease(raw []byte) (osReleaseData, error) {
	var out osReleaseData
	if len(raw) == 0 {
		return out, fmt.Errorf("os-release: empty content: %w", ErrMalformed)
	}

	values := make(map[string]string)
	for i, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSuffix(line, "\r")
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		key, rawValue, found := strings.Cut(trimmed, "=")
		if !found {
			return out, fmt.Errorf("os-release: line %d: expected KEY=VALUE: %w", i+1, ErrMalformed)
		}
		if !isAssignmentKey(key) {
			return out, fmt.Errorf("os-release: line %d: invalid key %q: %w", i+1, key, ErrMalformed)
		}
		value, err := decodeOSReleaseValue(rawValue)
		if err != nil {
			return out, fmt.Errorf("os-release: line %d key %s: %w", i+1, key, err)
		}
		values[key] = value
	}

	name, ok := values["NAME"]
	if !ok || strings.TrimSpace(name) == "" {
		return out, fmt.Errorf("os-release: %w: NAME", ErrMissingField)
	}
	id, ok := values["ID"]
	if !ok || strings.TrimSpace(id) == "" {
		return out, fmt.Errorf("os-release: %w: ID", ErrMissingField)
	}
	return osReleaseData{
		name:       name,
		id:         id,
		versionID:  values["VERSION_ID"],
		prettyName: values["PRETTY_NAME"],
	}, nil
}

// isAssignmentKey reports whether key is a non-empty shell identifier of
// [A-Za-z_][A-Za-z0-9_]*.
func isAssignmentKey(key string) bool {
	if key == "" {
		return false
	}
	for i, r := range key {
		switch {
		case r >= 'A' && r <= 'Z', r >= 'a' && r <= 'z', r == '_':
		case r >= '0' && r <= '9':
			if i == 0 {
				return false
			}
		default:
			return false
		}
	}
	return true
}

// decodeOSReleaseValue removes one layer of shell quoting from a raw value.
func decodeOSReleaseValue(v string) (string, error) {
	if v == "" {
		return "", nil
	}
	switch v[0] {
	case '\'':
		end := strings.IndexByte(v[1:], '\'')
		if end < 0 {
			return "", fmt.Errorf("unterminated single-quoted value: %w", ErrMalformed)
		}
		if end+2 != len(v) {
			return "", fmt.Errorf("trailing content after closing quote: %w", ErrMalformed)
		}
		return v[1 : 1+end], nil
	case '"':
		var b strings.Builder
		for i := 1; i < len(v); i++ {
			c := v[i]
			if c == '"' {
				if i != len(v)-1 {
					return "", fmt.Errorf("trailing content after closing quote: %w", ErrMalformed)
				}
				return b.String(), nil
			}
			if c != '\\' {
				b.WriteByte(c)
				continue
			}
			i++
			if i >= len(v) {
				return "", fmt.Errorf("dangling escape in double-quoted value: %w", ErrMalformed)
			}
			switch e := v[i]; e {
			case 'n':
				b.WriteByte('\n')
			case 't':
				b.WriteByte('\t')
			case 'r':
				b.WriteByte('\r')
			case '\\', '"', '\'', '`', '$':
				b.WriteByte(e)
			default:
				// Unknown escape: keep the backslash verbatim instead of
				// inventing a character.
				b.WriteByte('\\')
				b.WriteByte(e)
			}
		}
		return "", fmt.Errorf("unterminated double-quoted value: %w", ErrMalformed)
	default:
		return v, nil
	}
}
