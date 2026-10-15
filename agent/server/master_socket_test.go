package server

import (
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestEnsureMasterSocketVacantAllowsMissing(t *testing.T) {
	path := filepath.Join(t.TempDir(), "agent.sock")
	if err := ensureMasterSocketVacant(path); err != nil {
		t.Fatalf("unexpected refusal for missing socket: %v", err)
	}
	if _, err := os.Lstat(path); !os.IsNotExist(err) {
		t.Fatalf("must not create any file on probe; lstat error=%v", err)
	}
}

func TestEnsureMasterSocketVacantPreservesExistingFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "agent.sock")
	if err := os.WriteFile(path, []byte("owner data"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := ensureMasterSocketVacant(path); err == nil {
		t.Fatal("must refuse to replace an existing file")
	}
	data, err := os.ReadFile(path)
	if err != nil || string(data) != "owner data" {
		t.Fatalf("existing user file must be preserved, data=%q err=%v", data, err)
	}
}

func TestEnsureMasterSocketVacantPreservesSymlink(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "target")
	if err := os.WriteFile(target, []byte("unchanged"), 0o600); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "agent.sock")
	if err := os.Symlink(target, path); err != nil {
		t.Fatal(err)
	}
	if err := ensureMasterSocketVacant(path); err == nil {
		t.Fatal("must reject an existing symlink")
	}
	if info, err := os.Lstat(path); err != nil || info.Mode()&os.ModeSymlink == 0 {
		t.Fatalf("symlink was unexpectedly removed or changed: info=%v err=%v", info, err)
	}
	data, err := os.ReadFile(target)
	if err != nil || string(data) != "unchanged" {
		t.Fatal("symlink target modified")
	}
}

func TestEnsureMasterSocketVacantPreservesActiveListener(t *testing.T) {
	path := filepath.Join(t.TempDir(), "agent.sock")
	listener, err := net.Listen("unix", path)
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	if err := ensureMasterSocketVacant(path); err == nil {
		t.Fatal("must not unlink a socket owned by an active master")
	}
	conn, err := net.Dial("unix", path)
	if err != nil {
		t.Fatalf("active master socket must remain usable: %v", err)
	}
	conn.Close()
}

func TestEnsureMasterSocketVacantStaleSocketRequiresExplicitRecovery(t *testing.T) {
	path := filepath.Join(t.TempDir(), "agent.sock")
	l, err := net.Listen("unix", path)
	if err != nil {
		t.Fatal(err)
	}
	unixListener := l.(*net.UnixListener)
	unixListener.SetUnlinkOnClose(false)
	if err := l.Close(); err != nil {
		t.Fatal(err)
	}
	if err := ensureMasterSocketVacant(path); err == nil {
		t.Fatal("must reject a stale socket rather than auto-delete")
	}
	if _, err := os.Lstat(path); err != nil {
		t.Fatalf("stale socket must be preserved for explicit owner review: %v", err)
	}
}

func TestPrepareMasterSocketDirRejectsSymlinkWithoutChmodTarget(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "target")
	if err := os.Mkdir(target, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(target, 0o755); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(dir, "redirect")
	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}
	err := prepareMasterSocketDir(link)
	if err == nil || !strings.Contains(err.Error(), "real directory") {
		t.Fatalf("symlinked socket directory must be rejected, got: %v", err)
	}
	info, err := os.Stat(target)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o755 {
		t.Fatalf("symlink target permissions must be untouched, got %#o", info.Mode().Perm())
	}
}

func TestPrepareMasterSocketDirCreatesPrivateDirectory(t *testing.T) {
	path := filepath.Join(t.TempDir(), "socket")
	if err := prepareMasterSocketDir(path); err != nil {
		t.Fatal(err)
	}
	info, err := os.Lstat(path)
	if err != nil {
		t.Fatal(err)
	}
	if !info.IsDir() || info.Mode().Perm() != 0o700 {
		t.Fatalf("expected private real directory, got mode %v", info.Mode())
	}
}
