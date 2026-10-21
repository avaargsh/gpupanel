//go:build linux

package principalproof

import (
	"crypto/sha256"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"strings"
	"syscall"
	"testing"
	"time"
)

// TestRootPeerChild is launched only by the opt-in integration parent.
// It has an actual Linux kernel UID set by Credential; it never claims UID
// from JSON, an HTTP header, or a user-controlled file.
func TestRootPeerChild(t *testing.T) {
	if os.Getenv("GPUPANEL_TEST_CHILD_PEER") != "1" {
		t.Skip("helper only")
	}
	endpoint := os.Getenv("GPUPANEL_TEST_SOCKET")
	if endpoint == "" {
		t.Fatal("missing trusted integration socket")
	}
	conn, err := net.DialTimeout("unix", endpoint, 2*time.Second)
	if err != nil { t.Fatal(err) }
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(3*time.Second))
	// Never put the bearer challenge on argv or in the subprocess env.
	challenge, err := io.ReadAll(io.LimitReader(os.Stdin, 64))
	if err != nil || len(challenge) != 44 || challenge[len(challenge)-1] != '\n' {
		t.Fatal("unexpected test challenge")
	}
	if _, err = conn.Write(challenge); err != nil { t.Fatal(err) }
	reply, err := io.ReadAll(io.LimitReader(conn, 16))
	if err != nil { t.Fatal(err) }
	expected := os.Getenv("GPUPANEL_TEST_EXPECT")
	if string(reply) != expected+"\n" {
		t.Fatalf("unexpected peer verification result: got %q, want %q", reply, expected)
	}
}

func TestOptInPeerRuntimeRejectsDifferentActualUID(t *testing.T) {
	if os.Geteuid() != 0 {
		t.Skip("explicit privileged integration only: run isolated test binary as root")
	}
	r, err := StartOptIn()
	if err != nil { t.Fatal(err) }
	defer r.Close()
	if Current() != r { t.Fatal("opt-in listener not registered") }
	info, err := os.Lstat(r.SocketPath)
	if err != nil { t.Fatal(err) }
	if !info.Mode().IsRegular() && info.Mode()&os.ModeSocket == 0 {
		t.Fatal("endpoint is not an AF_UNIX socket")
	}
	parent, err := os.Lstat(r.dir)
	if err != nil { t.Fatal(err) }
	if parent.Mode().Perm() != 0o711 || info.Mode().Perm() != 0o666 {
		t.Fatalf("unexpected peer socket mode: directory=%o socket=%o",
			parent.Mode().Perm(), info.Mode().Perm())
	}

	key := fmt.Sprintf("%x", sha256.Sum256([]byte("isolated-browser-session")))
	peerAttempt := func(uid uint32, token, expected string) {
		t.Helper()
		cmd := exec.Command(os.Args[0], "-test.run=^TestRootPeerChild$", "-test.v")
		cmd.Env = append(os.Environ(),
			"GPUPANEL_TEST_CHILD_PEER=1",
			"GPUPANEL_TEST_SOCKET="+r.SocketPath,
			"GPUPANEL_TEST_EXPECT="+expected,
		)
		cmd.Stdin = strings.NewReader(token + "\n")
		cmd.SysProcAttr = &syscall.SysProcAttr{Credential: &syscall.Credential{
			Uid: uid, Gid: uid,
		}}
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("real UID %d peer failed: %v\n%s", uid, err, out)
		}
	}

	denied, err := r.Store.Begin(key, 1001)
	if err != nil { t.Fatal(err) }
	peerAttempt(1002, denied, "DENIED")
	if _, ok := r.Store.Lookup(key); ok {
		t.Fatal("wrong real Linux UID created an authenticated proof")
	}
	// Reused or consumed challenge cannot later succeed under the right UID.
	peerAttempt(1001, denied, "DENIED")
	allowed, err := r.Store.Begin(key, 1001)
	if err != nil { t.Fatal(err) }
	peerAttempt(1001, allowed, "OK")
	proof, ok := r.Store.Lookup(key)
	if !ok || proof.UID != 1001 || !proof.IdentityObserved ||
		proof.ExecutionAuthorized {
		t.Fatalf("wrong peer proof or privilege escalation: %+v, exists=%v", proof, ok)
	}
	peerAttempt(1001, allowed, "DENIED")
	r.Store.Revoke(key)
	if _, ok := r.Store.Lookup(key); ok { t.Fatal("revoke retained peer proof") }
}
