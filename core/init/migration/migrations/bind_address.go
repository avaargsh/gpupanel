package migrations

import "fmt"

// This seed is used only by the first settings migration, never on an existing DB.
func initialBindAddress(value string) (string, error) {
	switch value {
	case "":
		return "0.0.0.0", nil // Preserve installations made with older pctl files.
	case "127.0.0.1", "0.0.0.0":
		return value, nil
	default:
		return "", fmt.Errorf("invalid initial panel bind address")
	}
}
