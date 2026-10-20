//go:build linux

package main

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
	"golang.org/x/sys/unix"
)

// nativeUnixPath accepts ONLY Codex's standard local control-socket rendezvous
// beneath this non-root user's owned home. No arbitrary paths or /tmp search.
func nativeUnixPath() (string, error) {
	if runtime.GOOS != "linux" || userFence() != nil {
		return "", errors.New("Linux non-root account required")
	}
	home := os.Getenv("HOME")
	for _, folder := range []string{home, filepath.Join(home, ".codex"),
		filepath.Join(home, ".codex", "app-server-control")} {
		meta, err := os.Lstat(folder)
		if err != nil || !meta.IsDir() || meta.Mode()&os.ModeSymlink != 0 ||
			meta.Mode().Perm()&0o022 != 0 || !ownedByEUID(meta) {
			return "", errors.New("untrusted Codex local socket directory")
		}
	}
	socketPath := filepath.Join(home, ".codex", "app-server-control", "app-server-control.sock")
	alias, err := os.Lstat(socketPath)
	if err != nil || (!alias.Mode().IsRegular() &&
		alias.Mode()&os.ModeSymlink == 0 && alias.Mode()&os.ModeSocket == 0) {
		return "", errors.New("Codex Unix rendezvous socket unavailable")
	}
	if !ownedByEUID(alias) || alias.Mode().IsRegular() {
		return "", errors.New("foreign Codex Unix socket alias")
	}
	actual, err := os.Stat(socketPath)
	if err != nil || actual.Mode()&os.ModeSocket == 0 || !ownedByEUID(actual) {
		return "", errors.New("Codex Unix socket target is not owner-controlled")
	}
	return socketPath, nil
}

func ownedByEUID(info os.FileInfo) bool {
	st, ok := info.Sys().(*syscall.Stat_t)
	return ok && st.Uid == uint32(os.Geteuid())
}

// verifyUnixPeer checks the *connected* peer's kernel UID, not the socket path
// owner, a forged handshake header, a JSON field, or HTTP login identity.
func verifyUnixPeer(conn net.Conn, expected uint32) error {
	uc, ok := conn.(*net.UnixConn)
	if !ok { return errors.New("not a Unix socket") }
	raw, err := uc.SyscallConn()
	if err != nil { return err }
	var cred *unix.Ucred
	var optErr error
	if err := raw.Control(func(fd uintptr) {
		cred, optErr = unix.GetsockoptUcred(int(fd), unix.SOL_SOCKET, unix.SO_PEERCRED)
	}); err != nil { return err }
	if optErr != nil || cred == nil || cred.Uid != expected {
		return errors.New("Codex Unix peer UID differs from current Linux account")
	}
	return nil
}

func observeUnixPath(socketPath string, expectedUID uint32) (snapshot, error) {
	dialer := websocket.Dialer{
		HandshakeTimeout: 4*time.Second, EnableCompression: false,
		Proxy: nil,
		NetDialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			// Never make a TCP connection, even on WebSocket HTTP redirects.
			if network != "tcp" || address != "127.0.0.1:43210" {
				return nil, errors.New("unexpected native WebSocket destination")
			}
			conn, err := (&net.Dialer{Timeout:4*time.Second}).DialContext(ctx,"unix",socketPath)
			if err != nil { return nil, errors.New("Codex Unix connection unavailable") }
			if err := verifyUnixPeer(conn, expectedUID); err != nil {
				_ = conn.Close()
				return nil, err
			}
			return conn, nil
		},
	}
	conn, resp, err := dialer.Dial("ws://127.0.0.1:43210/",nil)
	if err != nil {
		if resp != nil && resp.Body != nil { _ = resp.Body.Close() }
		return snapshot{}, errors.New("verified native Unix WebSocket handshake failed")
	}
	defer conn.Close()
	conn.SetReadLimit(512*1024)
	got, err := observeConn(conn)
	if err != nil { return snapshot{}, err }
	got.Scope = nativeUnixObserverScope
	return got,nil
}

// Only a deliberate, non-root local CLI invokes this method; no Core Web
// handler, privileged Agent, or remote device is granted this native socket.
func observeNativeUnix() (snapshot,error) {
	socketPath, err := nativeUnixPath()
	if err != nil { return snapshot{},err }
	got, err := observeUnixPath(socketPath,uint32(os.Geteuid()))
	if err != nil { return snapshot{},fmt.Errorf("same-user native observation refused: %w",err) }
	return got,nil
}
