//go:build !linux

package main

import "errors"

// Native identity via SO_PEERCRED is Linux-only and cannot be approximated by
// an unauthenticated TCP connection on other platforms.
func observeNativeUnix() (snapshot,error) {
	return snapshot{},errors.New("native Unix peer credentials require Linux")
}
