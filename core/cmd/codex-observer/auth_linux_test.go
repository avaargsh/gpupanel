//go:build linux

package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/user"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/gorilla/websocket"
)

func privateTokenFixture(t *testing.T) (string, string) {
	t.Helper()
	if userFence() != nil { t.Skip("real normal Ubuntu UID required") }
	who, err := user.Current()
	if err != nil { t.Fatal(err) }
	dir, err := os.MkdirTemp(who.HomeDir, ".gpupanel-auth-test-")
	if err != nil { t.Fatal(err) }
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	if err := os.Chmod(dir, 0o700); err != nil { t.Fatal(err) }
	path := filepath.Join(dir, "ws-token")
	token := strings.Repeat("Xy9k", 16)
	if err := os.WriteFile(path, []byte(token+"\n"), 0o600); err != nil { t.Fatal(err) }
	if err := os.Chmod(path, 0o600); err != nil { t.Fatal(err) }
	return path, token
}

func TestPrivateLocalBearerRejectsUnsafePathsAndContents(t *testing.T) {
	file, token := privateTokenFixture(t)
	if got, err := readOwnedTokenFile(file); err != nil || got != token {
		t.Fatalf("private user token was refused: %v", err)
	}
	if err := os.Chmod(file, 0o644); err != nil { t.Fatal(err) }
	if got, err := readOwnedTokenFile(file); err == nil || got != "" {
		t.Fatal("world-readable bearer token was accepted")
	}
	if err := os.Chmod(file, 0o600); err != nil { t.Fatal(err) }
	dir := filepath.Dir(file)
	link := filepath.Join(dir, "alias")
	if err := os.Symlink(file, link); err != nil { t.Fatal(err) }
	if got, err := readOwnedTokenFile(link); err == nil || got != "" {
		t.Fatal("symlinked secret was accepted")
	}
	parentLink := filepath.Join(filepath.Dir(dir), filepath.Base(dir)+"-link")
	if err := os.Symlink(dir, parentLink); err != nil { t.Fatal(err) }
	t.Cleanup(func() { _ = os.Remove(parentLink) })
	if _, err := readOwnedTokenFile(filepath.Join(parentLink, "ws-token")); err == nil {
		t.Fatal("symlinked parent directory accepted")
	}
	if _, err := readOwnedTokenFile("/tmp/unowned-secret"); err == nil {
		t.Fatal("outside-HOME secret path accepted")
	}
	for _, invalid := range []string{"short", strings.Repeat("A", 300), "bad spaces "+strings.Repeat("X", 40),
		strings.Repeat("z", 40)+"\nsecond-line"} {
		if err := os.WriteFile(file, []byte(invalid), 0o600); err != nil { t.Fatal(err) }
		if got, err := readOwnedTokenFile(file); err == nil || got != "" {
			t.Fatal("invalid or injected bearer was accepted")
		}
	}
}

func TestAuthenticatedWebSocketRejectsMissingTokenAndNeverExportsIt(t *testing.T) {
	token := strings.Repeat("Ab3t", 16)
	var requests atomic.Int32
	upgrader := websocket.Upgrader{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Origin") != "" {
			t.Error("observer must not send a browser Origin")
		}
		if r.Header.Get("Authorization") != "Bearer "+token {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		requests.Add(1)
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil { t.Error(err); return }
		defer conn.Close()
		for {
			var req struct{ ID int `json:"id"`; Method string `json:"method"` }
			if conn.ReadJSON(&req) != nil { return }
			switch req.Method {
			case "initialize":
				_ = conn.WriteJSON(map[string]any{"id":1, "result":map[string]any{}})
			case "initialized":
			case "thread/list":
				_ = conn.WriteJSON(map[string]any{"id":2,"result":map[string]any{
					"data":[]any{map[string]any{
						"id":"thread-authenticated","createdAt":1792490400,
						"cwd":"/home/dev/private-project",
						"prompt":"SECRET_SHOULD_NEVER_LEAK",
						"status":map[string]string{"type":"notLoaded"},
					}},"nextCursor":nil,
				}})
				return
			default:
				t.Errorf("observer sent unsupported native RPC: %s", req.Method)
				return
			}
		}
	}))
	defer server.Close()
	address := "ws"+strings.TrimPrefix(server.URL, "http")
	if _, err := observeAuthenticated(address, ""); err == nil {
		t.Fatal("missing bearer unexpectedly passed WebSocket admission")
	}
	if _, err := observeAuthenticated(address, strings.Repeat("Q",64)); err == nil {
		t.Fatal("incorrect bearer unexpectedly passed WebSocket admission")
	}
	snap, err := observeAuthenticated(address, token)
	if err != nil { t.Fatal(err) }
	if requests.Load() != 1 || len(snap.Sessions) != 1 {
		t.Fatalf("authenticated reader produced unexpected observation count")
	}
	if snap.Verified || snap.Sessions[0].Liveness != "unknown" {
		t.Fatal("token was incorrectly promoted to global runtime authority")
	}
	encoded, err := json.Marshal(snap)
	if err != nil { t.Fatal(err) }
	if strings.Contains(string(encoded), token) || strings.Contains(string(encoded), "SECRET_SHOULD_NEVER_LEAK") ||
		strings.Contains(string(encoded), "/home/") {
		t.Fatal("native secrets escaped authenticated projection")
	}
}
