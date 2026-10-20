//go:build linux

package principalproof

import (
	"errors"
	"net"
	"os"
	"path/filepath"
	"testing"
)

func acceptedPair(t *testing.T) (*net.UnixConn, *net.UnixConn) {
	t.Helper()
	socket := filepath.Join(t.TempDir(), "principal-proof.sock")
	listener, err := net.ListenUnix("unix", &net.UnixAddr{Name: socket, Net: "unix"})
	if err != nil { t.Fatal(err) }
	t.Cleanup(func() { _ = listener.Close() })
	type result struct { conn *net.UnixConn; err error }
	ch := make(chan result, 1)
	go func() { c, err := listener.AcceptUnix(); ch <- result{c, err} }()
	client, err := net.DialUnix("unix", nil, &net.UnixAddr{Name: socket, Net: "unix"})
	if err != nil { t.Fatal(err) }
	t.Cleanup(func() { _ = client.Close() })
	accepted := <-ch
	if accepted.err != nil { t.Fatal(accepted.err) }
	t.Cleanup(func() { _ = accepted.conn.Close() })
	return client, accepted.conn
}

func TestUnixSocketPeerKernelUIDAndOneShotProof(t *testing.T) {
	client, server := acceptedPair(t)
	uid, err := PeerUID(server)
	if err != nil { t.Fatal(err) }
	if uid != uint32(os.Getuid()) {
		t.Fatalf("kernel-reported socket UID = %d, process UID = %d", uid, os.Getuid())
	}
	store := New(nil)
	if uid < 1000 || uid > 60000 {
		// In privileged CI we still exercise the kernel credential read, but
		// never grant a principal proof for UID=0.
		return
	}
	key := key("kernel-checked-web-session")
	nonce, err := store.Begin(key, uid)
	if err != nil { t.Fatal(err) }
	if _, err := client.Write([]byte(nonce + "\n")); err != nil { t.Fatal(err) }
	proof, err := store.VerifyUnixPeer(server)
	if err != nil { t.Fatal(err) }
	if proof.UID != uid || proof.ExecutionAuthorized || !proof.IdentityObserved {
		t.Fatalf("invalid peer credential proof: %+v", proof)
	}
	if _, ok := store.Lookup(key); !ok { t.Fatal("valid kernel UID did not create proof") }
}

func TestUnixSocketPeerCannotClaimAnotherLinuxUID(t *testing.T) {
	client, server := acceptedPair(t)
	uid := uint32(os.Getuid())
	if uid > 60000 { t.Skip("outside supported local UID range") }
	wrongUID := uint32(1000)
	if uid == 1000 { wrongUID = 1001 }
	store := New(nil)
	key := key("foreign-web-session")
	nonce, err := store.Begin(key, wrongUID)
	if err != nil { t.Fatal(err) }
	if _, err := client.Write([]byte(nonce + "\n")); err != nil { t.Fatal(err) }
	if _, err := store.VerifyUnixPeer(server); !errors.Is(err, ErrWrongUID) {
		t.Fatalf("kernel UID impersonated another local user: %v", err)
	}
	if _, ok := store.Lookup(key); ok { t.Fatal("mismatched peer gained proof") }
}

func TestUnixSocketRejectsMalformedChallengeAndNil(t *testing.T) {
	if _, err := PeerUID(nil); !errors.Is(err, ErrInvalidRequest) {
		t.Fatalf("nil unix connection unexpectedly accepted: %v", err)
	}
	client, server := acceptedPair(t)
	store := New(nil)
	if _, err := client.Write([]byte("userId=1000&fake=true\n")); err != nil { t.Fatal(err) }
	if _, err := store.VerifyUnixPeer(server); !errors.Is(err, ErrInvalidRequest) {
		t.Fatalf("accepted forged client-declared credentials: %v", err)
	}
}
