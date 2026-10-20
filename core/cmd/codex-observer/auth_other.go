//go:build !linux

package main

import "errors"

func readOwnedTokenFile(_ string) (string, error) {
	return "", errors.New("Codex bearer credentials are supported only for verified Linux users")
}
