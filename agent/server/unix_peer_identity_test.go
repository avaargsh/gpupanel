package server

import (
	"context"
	"net"
	"os"
	"path/filepath"
	"testing"
)

func TestUnixPeerIdentityFromContextRejectsAbsentEvidence(t *testing.T) {
	if _, err := UnixPeerIdentityFromContext(context.Background()); err == nil {
		t.Fatal("missing peer evidence must fail closed")
	}
}

func TestUnixPeerIdentityCaptureRejectsTCP(t *testing.T) {
	client, server := net.Pipe()
	defer client.Close()
	defer server.Close()
	ctx := withUnixPeerIdentity(context.Background(), server)
	if _, err := UnixPeerIdentityFromContext(ctx); err == nil {
		t.Fatal("non-Unix connection must not yield peer identity")
	}
}

func TestUnixPeerIdentityCaptureFromUnixSocket(t *testing.T) {
	path := filepath.Join(t.TempDir(), "peer.sock")
	listener, err := net.Listen("unix", path)
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()

	accepted := make(chan net.Conn, 1)
	acceptErr := make(chan error, 1)
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			acceptErr <- err
			return
		}
		accepted <- conn
	}()

	client, err := net.Dial("unix", path)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()

	var peer net.Conn
	select {
	case peer = <-accepted:
	case err := <-acceptErr:
		t.Fatal(err)
	}
	defer peer.Close()

	ctx := withUnixPeerIdentity(context.Background(), peer)
	identity, err := UnixPeerIdentityFromContext(ctx)
	if err != nil {
		t.Fatalf("expected kernel peer identity: %v", err)
	}
	if identity.PID <= 0 {
		t.Fatalf("expected positive peer PID, got %d", identity.PID)
	}
	if identity.UID != uint32(os.Geteuid()) {
		t.Fatalf("peer UID=%d, want current test UID=%d", identity.UID, os.Geteuid())
	}
}
