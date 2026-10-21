//go:build linux

package server

import (
	"errors"
	"fmt"
	"net"
	"syscall"
)

func readUnixPeerIdentity(conn net.Conn) (*UnixPeerIdentity, error) {
	unixConn, ok := conn.(*net.UnixConn)
	if !ok {
		return nil, errors.New("peer identity requires a Unix-domain connection")
	}
	raw, err := unixConn.SyscallConn()
	if err != nil {
		return nil, fmt.Errorf("obtain Unix socket descriptor: %w", err)
	}
	var cred *syscall.Ucred
	var controlErr error
	if err := raw.Control(func(fd uintptr) {
		cred, controlErr = syscall.GetsockoptUcred(int(fd), syscall.SOL_SOCKET, syscall.SO_PEERCRED)
	}); err != nil {
		return nil, fmt.Errorf("inspect Unix peer credentials: %w", err)
	}
	if controlErr != nil {
		return nil, fmt.Errorf("read Unix peer credentials: %w", controlErr)
	}
	if cred == nil || cred.Pid <= 0 {
		return nil, errors.New("kernel returned invalid Unix peer credentials")
	}
	return &UnixPeerIdentity{PID: int(cred.Pid), UID: cred.Uid, GID: cred.Gid}, nil
}
