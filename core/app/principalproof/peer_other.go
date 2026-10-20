//go:build !linux

package principalproof

import (
	"errors"
	"net"
)

// Explicitly fail closed on non-Linux systems: Unix peer credentials are not
// assumed portable to other OS implementations.
func PeerUID(_ *net.UnixConn) (uint32, error) {
	return 0, errors.New("principal proof: SO_PEERCRED requires Linux")
}

func (s *Store) VerifyUnixPeer(_ *net.UnixConn) (Proof, error) {
	return Proof{}, errors.New("principal proof: unsupported platform")
}
