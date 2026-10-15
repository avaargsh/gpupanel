package server

import (
	"context"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestOwnedMasterSocketCleanShutdownAllowsSafeRestart(t *testing.T) {
	socket := filepath.Join(t.TempDir(), "agent.sock")
	listener, err := net.Listen("unix", socket)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = io.WriteString(w, "ready") })}
	result := make(chan error, 1)
	go func() { result <- serveOwnedMasterSocket(ctx, server, listener) }()
	transport := &http.Transport{DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, "unix", socket)
	}}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: time.Second}
	response, err := client.Get("http://unix/ready")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = io.Copy(io.Discard, response.Body)
	_ = response.Body.Close()
	if err := ensureMasterSocketVacant(socket); err == nil {
		t.Fatal("live socket was not protected")
	}
	cancel()
	select {
	case err := <-result:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("clean shutdown did not finish")
	}
	if _, err := os.Lstat(socket); !os.IsNotExist(err) {
		t.Fatal("self-owned socket was not closed/unlinked")
	}
	if err := ensureMasterSocketVacant(socket); err != nil {
		t.Fatal(err)
	}
	next, err := net.Listen("unix", socket)
	if err != nil {
		t.Fatal(err)
	}
	defer next.Close()
	if err := ensureMasterSocketVacant(socket); err == nil {
		t.Fatal("replacement live socket lost its protection")
	}
}
