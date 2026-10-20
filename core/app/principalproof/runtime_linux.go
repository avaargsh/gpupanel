//go:build linux

package principalproof

import (
	"errors"
	"net"
	"os"
	"path/filepath"
	"sync"
	"syscall"
)

type Runtime struct {
	Store *Store
	SocketPath string
	socket *net.UnixListener
	dir string
	stopOnce sync.Once
}
var (
	currentMu sync.RWMutex
	current *Runtime
)

// StartOptIn starts a single Core-owned local Unix listener. Production Core
// leaves it disabled unless the operator opts in explicitly.
func StartOptIn() (*Runtime, error) {
	if os.Geteuid() != 0 {
		return nil, errors.New("principal proof requires root-owned /run socket")
	}
	parent, err := os.Lstat("/run")
	if err != nil || !parent.IsDir() || parent.Mode()&os.ModeSymlink != 0 {
		return nil, errors.New("untrusted /run directory")
	}
	info, ok := parent.Sys().(*syscall.Stat_t)
	if !ok || info.Uid != 0 || parent.Mode().Perm()&0o022 != 0 {
		return nil, errors.New("untrusted /run owner")
	}
	dir, err := os.MkdirTemp("/run", "gpupanel-proof-")
	if err != nil { return nil, err }
	fail := func(e error) (*Runtime, error) { _ = os.RemoveAll(dir); return nil, e }
	path := filepath.Join(dir, "pair.sock")
	socket, err := net.ListenUnix("unix", &net.UnixAddr{Name:path, Net:"unix"})
	if err != nil { return fail(err) }
	if err = os.Chmod(path, 0o666); err != nil {
		_ = socket.Close()
		return fail(err)
	}
	if err = os.Chmod(dir, 0o711); err != nil {
		_ = socket.Close()
		return fail(err)
	}
	r := &Runtime{Store:New(nil), SocketPath:path, socket:socket, dir:dir}
	currentMu.Lock()
	if current != nil {
		currentMu.Unlock()
		r.Close()
		return nil, errors.New("principal proof already started")
	}
	current = r
	currentMu.Unlock()
	go r.accept()
	return r, nil
}
func Current() *Runtime {
	currentMu.RLock()
	defer currentMu.RUnlock()
	return current
}
func (r *Runtime) accept() {
	limit := make(chan struct{}, 8)
	for {
		conn, err := r.socket.AcceptUnix()
		if err != nil { return }
		select {
		case limit <- struct{}{}:
			go func() {
				defer func() { <-limit; _ = conn.Close() }()
				_, err := r.Store.VerifyUnixPeer(conn)
				// No UID, nonce or session detail is returned on failure.
				if err != nil { _, _ = conn.Write([]byte("DENIED\n")); return }
				_, _ = conn.Write([]byte("OK\n"))
			}()
		default:
			_ = conn.Close()
		}
	}
}
func (r *Runtime) Close() {
	r.stopOnce.Do(func() {
		currentMu.Lock()
		if current == r { current = nil }
		currentMu.Unlock()
		_ = r.socket.Close()
		_ = os.Remove(r.SocketPath)
		_ = os.Remove(r.dir)
	})
}
