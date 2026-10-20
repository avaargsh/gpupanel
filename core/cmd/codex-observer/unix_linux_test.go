//go:build linux

package main

import (
	"encoding/json"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func unixFixture(t *testing.T, responses func(*websocket.Conn)) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "native.sock")
	listener, err := net.Listen("unix",path)
	if err!=nil {t.Fatal(err)}
	t.Cleanup(func(){_ = listener.Close()})
	var upgrader websocket.Upgrader
	handler := http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
		conn,err:=upgrader.Upgrade(w,r,nil)
		if err!=nil{t.Error(err);return}
		defer conn.Close()
		responses(conn)
	})
	srv := &http.Server{Handler:handler,ReadHeaderTimeout:2*time.Second}
	go func(){_ = srv.Serve(listener)}()
	t.Cleanup(func(){_ = srv.Close()})
	return path
}
func TestNativeUnixSameKernelUIDReadsOnlyAndSanitizes(t *testing.T) {
	var calls atomic.Int32
	socket:=unixFixture(t,func(conn *websocket.Conn){
		for {
			var req map[string]json.RawMessage
			if conn.ReadJSON(&req)!=nil{return}
			var method string
			_ = json.Unmarshal(req["method"],&method)
			calls.Add(1)
			switch method {
			case "initialize":
				_ = conn.WriteJSON(map[string]any{"id":1,"result":map[string]any{}})
			case "initialized":
			case "thread/list":
				var params struct{ DB bool `json:"useStateDbOnly"`;Limit int `json:"limit"` }
				if json.Unmarshal(req["params"],&params)!=nil || !params.DB || params.Limit!=25 {
					t.Error("unsafe native request");return
				}
				_ = conn.WriteJSON(map[string]any{"id":2,"result":map[string]any{
					"data":[]any{map[string]any{
						"id":"thread-1","createdAt":1792490400,
						"cwd":"/home/alice/my-project","prompt":"SECRET_NEVER_EXPORTED",
						"status":map[string]string{"type":"active"},
					}},"nextCursor":nil}})
				return
			default: t.Errorf("forbidden RPC %q",method);return
			}
		}
	})
	result,err:=observeUnixPath(socket,uint32(os.Geteuid()))
	if err!=nil {t.Fatal(err)}
	if result.Scope!=nativeUnixObserverScope || result.Verified ||
		result.Sessions[0].Liveness!="unknown" || calls.Load()!=3 {
		t.Fatalf("incorrect owner-attested observation: %+v, calls %d",result,calls.Load())
	}
	serialized,_:=json.Marshal(result)
	if strings.Contains(string(serialized),"SECRET") || strings.Contains(string(serialized),"/home/") {
		t.Fatal("native secrets leaked")
	}
}
func TestNativeUnixRejectsDifferentPeerUIDBeforeRPC(t *testing.T) {
	var calls atomic.Int32
	socket:=unixFixture(t,func(conn *websocket.Conn){
		calls.Add(1)
	})
	wrong:=uint32(os.Geteuid()+1)
	if _,err:=observeUnixPath(socket,wrong);err==nil {
		t.Fatal("observer accepted foreign kernel UID")
	}
	if calls.Load()!=0 {t.Fatal("unauthorized peer received WebSocket handshake")}
}
func TestNativeUnixUnavailableFailsClosed(t *testing.T) {
	path:=filepath.Join(t.TempDir(),"not-running.sock")
	if _,err:=observeUnixPath(path,uint32(os.Geteuid()));err==nil {
		t.Fatal("missing native Unix endpoint returned success")
	}
}
func TestNativeUnixWatchDisconnectionDropsSnapshot(t *testing.T) {
	socket:=unixFixture(t,func(conn *websocket.Conn){
		for {
			var req map[string]json.RawMessage
			if conn.ReadJSON(&req)!=nil{return}
			var method string
			_ = json.Unmarshal(req["method"],&method)
			switch method {
			case "initialize": _ = conn.WriteJSON(map[string]any{"id":1,"result":map[string]any{}})
			case "thread/list": _ = conn.WriteJSON(map[string]any{"id":2,"result":map[string]any{
				"data":[]any{map[string]any{"id":"thread-1","createdAt":1792490400,"status":map[string]string{"type":"idle"}}},
				"nextCursor":nil,
			}});return
			}
		}
	})
	got,err:=observeUnixPath(socket,uint32(os.Geteuid()))
	if err!=nil {t.Fatal(err)}
	first:=makeWatchRecord(1,time.Now(),got,nil)
	if first.Connection!="observed" || first.Snapshot==nil {t.Fatal("verified native watch refused")}
	disconnected:=makeWatchRecord(2,time.Now(),snapshot{},os.ErrNotExist)
	if disconnected.Connection!="unavailable" || disconnected.Snapshot!=nil {
		t.Fatal("last-known state leaked into lost native connection")
	}
}
