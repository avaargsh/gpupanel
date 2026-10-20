package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gorilla/websocket"
)

func TestObserverEndpointRequiresExplicitLoopbackNoCredentials(t *testing.T) {
	for _, address := range []string{
		"", "ws://localhost:4222", "ws://0.0.0.0:4222",
		"ws://192.168.1.10:4222", "wss://127.0.0.1:4222",
		"ws://127.0.0.1:80", "ws://127.0.0.1:65536", "ws://127.0.0.1:04222",
		"ws://user:secret@127.0.0.1:4222",
		"ws://127.0.0.1:4222/",
		"ws://127.0.0.1:4222/private",
		"ws://127.0.0.1:4222?",
		"ws://127.0.0.1:4222#",
		"ws://127.0.0.1:4222/?token=private",
		"ws://127.0.0.1:4222/#fragment",
	} {
		if _,err:=endpoint(address);err==nil{t.Errorf("accepted unsafe address %q",address)}
	}
	if got,err:=endpoint("ws://127.0.0.1:4222");err!=nil || got!="ws://127.0.0.1:4222" {
		t.Fatalf("explicit loopback refused %s %v",got,err)
	}
}

func TestProjectDropsSecretsAndDoesNotInventGlobalLiveness(t *testing.T) {
	raw:=json.RawMessage(`{"data":[{"id":"123e4567-e89b-12d3-a456-426614174000",
		"createdAt":1792490400,"cwd":"/home/ubuntu/private-project",
		"preview":"SECRET_PROMPT","token":"SECRET_TOKEN",
		"status":{"type":"active"}}],"nextCursor":"PRIVATE_CURSOR"}`)
	parsed,err:=project(raw)
	if err!=nil {t.Fatal(err)}
	out,_:=json.Marshal(parsed)
	text:=string(out)
	if strings.Contains(text,"SECRET") || strings.Contains(text,"/home/") || strings.Contains(text,"PRIVATE_CURSOR") {
		t.Fatalf("sensitive fields escaped projection")
	}
	if parsed.Verified || len(parsed.Sessions)!=1 ||
		parsed.Sessions[0].Liveness!="unknown" || parsed.Sessions[0].Status!="active" ||
		parsed.Scope!="attached-loopback-appserver" || !parsed.HasMore {
		t.Fatalf("unsafe observer status projection: %+v",parsed)
	}
	for _,wrong:=range []string{
		`{"data":[{"id":"../../bad","createdAt":1792490400,"status":{"type":"idle"}}]}`,
		`{"data":[{"id":"x","createdAt":1792490400,"status":{"type":"running"}}]}`,
		`{"data":[{"id":"x","createdAt":1792490400,"status":{"type":"active"}},
			{"id":"x","createdAt":1792490400,"status":{"type":"active"}}]}`,
		`{"data":[{"id":"x","createdAt":"today","status":{"type":"idle"}}]}`,
		`{"data":null,"nextCursor":null}`,
		`{"data":[],"nextCursor":""}`,
	} {
		if _,err:=project(json.RawMessage(wrong));err==nil{t.Errorf("accepted invalid native data: %s",wrong)}
	}
}

func TestExistingWebsocketReadOnlyHandshake(t *testing.T) {
	upgrader:=websocket.Upgrader{}
	srv:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
		conn,err:=upgrader.Upgrade(w,r,nil)
		if err!=nil {t.Error(err);return}
		defer conn.Close()
		seen:=[]string{}
		for {
			var msg map[string]json.RawMessage
			if err:=conn.ReadJSON(&msg);err!=nil {return}
			var method string
			if err:=json.Unmarshal(msg["method"],&method);err!=nil {t.Error(err);return}
			seen=append(seen,method)
			switch method {
			case "initialize":
				_ = conn.WriteJSON(map[string]any{"id":1,"result":map[string]any{}})
			case "initialized":
				// Deliberately no response for protocol notification.
			case "thread/list":
				var params struct { Limit int `json:"limit"`; DB bool `json:"useStateDbOnly"` }
				if err:=json.Unmarshal(msg["params"],&params);err!=nil || !params.DB || params.Limit!=25 {
					t.Errorf("observer requested unsafe native method flags")
					return
				}
				if strings.Join(seen,",")!="initialize,initialized,thread/list" {
					t.Errorf("unexpected RPC sequence: %v",seen)
				}
				_ = conn.WriteJSON(map[string]any{"id":2,"result":map[string]any{
					"data":[]any{map[string]any{
						"id":"thread-1", "createdAt":1792490400,
						"cwd":"/home/dev/project", "preview":"PRIVATE_TEXT",
						"status":map[string]any{"type":"idle"},
					}},
					"nextCursor":nil,
				}})
				return
			default:
				t.Errorf("observer dispatched non-read-only RPC: %s",method)
				return
			}
		}
	}))
	defer srv.Close()
	url:="ws"+strings.TrimPrefix(srv.URL,"http")
	parsed,err:=observe(url)
	if err!=nil {t.Fatal(err)}
	if len(parsed.Sessions)!=1 || parsed.Sessions[0].SessionID!="thread-1" ||
		parsed.Sessions[0].Liveness!="unknown" ||
		parsed.Sessions[0].Project!="project" {
		t.Fatalf("unexpected attached native projection: %+v",parsed)
	}
}

func TestExistingWebsocketNativeErrorFailsClosed(t *testing.T) {
	upgrader:=websocket.Upgrader{}
	srv:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
		conn,err:=upgrader.Upgrade(w,r,nil)
		if err!=nil {return}
		defer conn.Close()
		for {
			var message map[string]json.RawMessage
			if conn.ReadJSON(&message)!=nil{return}
			var method string
			_ = json.Unmarshal(message["method"],&method)
			if method=="initialize" { _=conn.WriteJSON(map[string]any{"id":1,"result":map[string]any{}}) }
			if method=="thread/list" {
				_ = conn.WriteJSON(map[string]any{"id":2,"error":map[string]any{
					"code":-32603,"message":"SECRET_DATABASE_ERROR"}})
				return
			}
		}
	}))
	defer srv.Close()
	url:="ws"+strings.TrimPrefix(srv.URL,"http")
	if _,err:=observe(url);err==nil{t.Fatal("native error reported as empty snapshot")}
}

func TestAuthenticatedObserverPinsDialToLoopbackAndOmitsProxy(t *testing.T) {
	token := strings.Repeat("Ab3t",16)
	var hits int
	upgrader:=websocket.Upgrader{}
	srv:=httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
		hits++
		if r.Header.Get("Authorization")!="Bearer "+token {
			w.WriteHeader(http.StatusUnauthorized);return
		}
		if r.Header.Get("Origin")!="" { t.Error("unexpected Origin") }
		conn,err:=upgrader.Upgrade(w,r,nil);if err!=nil{return};defer conn.Close()
		for {
			var msg map[string]json.RawMessage
			if conn.ReadJSON(&msg)!=nil{return}
			var method string;_ = json.Unmarshal(msg["method"],&method)
			switch method {
			case "initialize": _=conn.WriteJSON(map[string]any{"id":1,"result":map[string]any{}})
			case "initialized":
			case "thread/list": _=conn.WriteJSON(map[string]any{"id":2,"result":map[string]any{"data":[]any{},"nextCursor":nil}});return
			default:t.Errorf("unexpected method %s",method);return
			}
		}
	}));defer srv.Close()
	addr:="ws"+strings.TrimPrefix(srv.URL,"http")
	// Force a deliberately unusable proxy. The explicit direct dialer must
	// ignore it and complete the authenticated loopback-only RPC handshake.
	t.Setenv("HTTP_PROXY","http://127.0.0.1:1")
	t.Setenv("http_proxy","http://127.0.0.1:1")
	got,err:=observeAuthenticated(addr,token)
	if err!=nil { t.Fatalf("authenticated loopback observation failed: %v",err) }
	if len(got.Sessions)!=0 || got.Verified || got.Scope!="attached-loopback-appserver" {
		t.Fatalf("unexpected authenticated projection: %+v",got)
	}
	if hits!=1 { t.Fatalf("expected one direct authenticated request, got %d",hits) }
}
