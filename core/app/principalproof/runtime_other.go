//go:build !linux

package principalproof

import "errors"

type Runtime struct {
	Store *Store
	SocketPath string
}
func StartOptIn() (*Runtime,error) { return nil,errors.New("Linux SO_PEERCRED required") }
func Current() *Runtime { return nil }
func (r *Runtime) Close() {}
