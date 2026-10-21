//go:build !linux

package server

import (
	"errors"
	"net"
)

func readUnixPeerIdentity(net.Conn) (*UnixPeerIdentity, error) {
	return nil, errors.New("kernel Unix peer credentials are unsupported on this platform")
}
