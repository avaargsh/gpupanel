//go:build linux

package principalproof

import (
	"bufio"
	"errors"
	"io"
	"net"
	"strings"
	"time"

	"golang.org/x/sys/unix"
)

// PeerUID returns the UID asserted by Linux SO_PEERCRED for an accepted local
// SOCK_STREAM Unix socket. This must never be replaced with client JSON or
// an inferred web user. Call this ONLY on the server's accepted UnixConn.
func PeerUID(conn *net.UnixConn) (uint32, error) {
	if conn == nil {
		return 0, ErrInvalidRequest
	}
	raw, err := conn.SyscallConn()
	if err != nil {
		return 0, err
	}
	var cred *unix.Ucred
	var socketErr error
	if err := raw.Control(func(fd uintptr) {
		cred, socketErr = unix.GetsockoptUcred(int(fd), unix.SOL_SOCKET, unix.SO_PEERCRED)
	}); err != nil {
		return 0, err
	}
	if socketErr != nil || cred == nil {
		return 0, errors.New("principal proof: peer credentials unavailable")
	}
	return cred.Uid, nil
}

// VerifyUnixPeer consumes exactly one bounded newline-delimited challenge from
// an accepted Unix socket. The socket listener must be local, not network
// proxied, and owned/created by Core in a trusted non-world-writable directory.
// A listener, HTTP API and routing are intentionally NOT introduced here.
func (s *Store) VerifyUnixPeer(conn *net.UnixConn) (Proof, error) {
	uid, err := PeerUID(conn)
	if err != nil {
		return Proof{}, err
	}
	if err := conn.SetReadDeadline(time.Now().Add(2 * time.Second)); err != nil {
		return Proof{}, err
	}
	defer conn.SetReadDeadline(time.Time{})
	// The token is 43 base64url chars + newline. Cap memory before parsing.
	reader := bufio.NewReader(io.LimitReader(conn, 128))
	line, err := reader.ReadString('\n')
	if err != nil {
		return Proof{}, ErrInvalidRequest
	}
	token := strings.TrimSuffix(line, "\n")
	if len(token) != 43 || strings.ContainsAny(token, "\r\t ") {
		return Proof{}, ErrInvalidRequest
	}
	return s.finish(token, uid)
}
