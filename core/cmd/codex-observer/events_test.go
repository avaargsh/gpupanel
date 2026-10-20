package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestStatusNotificationProjectsOnlyKnownThreads(t *testing.T) {
	base := snapshot{Version:2, Source:"local-user-codex-appserver",
		ReadOnly:true, Verified:false, Scope:"attached-loopback-appserver",
		Sessions:[]session{{SessionID:"thread-a",Runtime:"codex",
			Started:"2026-10-20T10:00:00Z",Status:"idle",Liveness:"unknown"}},
	}
	event := func(method, id, state string) []byte {
		frame,_ := json.Marshal(map[string]any{
			"method":method, "params":map[string]any{
				"threadId":id, "status":map[string]string{"type":state},
				"preview":"SENSITIVE_SECRET_DO_NOT_INCLUDE",
			},
		})
		return frame
	}
	next, changed, resync, err := applyNativeEvent(base,event("thread/status/changed","thread-a","active"))
	if err!=nil || !changed || resync || next.Sessions[0].Status!="active" ||
		base.Sessions[0].Status!="idle" || next.Sessions[0].Liveness!="unknown" {
		t.Fatalf("invalid native delta semantics: %+v changed=%v sync=%v err=%v",next,changed,resync,err)
	}
	if raw,_:=json.Marshal(next);strings.Contains(string(raw),"SENSITIVE_SECRET") {
		t.Fatal("native event prompt escaped filtered projection")
	}
	for _,tc := range []struct{method,id,status string}{
		{"item/agentMessage/delta","thread-a","active"},
		{"thread/status/changed","unlisted-private-thread","active"},
	} {
		out,changed,resync,err:=applyNativeEvent(base,event(tc.method,tc.id,tc.status))
		if err!=nil || changed || resync || out.Sessions[0].Status!="idle" {
			t.Fatalf("unauthorized event leaked or changed native state %+v",tc)
		}
	}
	if _,changed,resync,err:=applyNativeEvent(base,event("thread/started","thread-b","idle"));
		err!=nil || changed || !resync { t.Fatal("thread set change was not reconciled") }
	for _,wire:=range [][]byte{
		event("thread/status/changed","thread-a","compromised"),
		[]byte(`{"method":"thread/status/changed","params":{"threadId":"../../tmp","status":{"type":"active"}}}`),
		[]byte(`{"method":"error","params":{"message":"PRIVATE_CREDENTIAL"}}`),
		[]byte("not json"),
	} {
		if _,_,_,err:=applyNativeEvent(base,wire);err==nil {
			t.Fatalf("bad notification accepted: %s",wire)
		}
	}
}

func TestNativeEventReconnectDropsStaleStateAndRequeries(t *testing.T) {
	var connections atomic.Int32
	upgrader := websocket.Upgrader{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request) {
		conn,err:=upgrader.Upgrade(w,r,nil);if err!=nil{return}
		defer conn.Close()
		n:=connections.Add(1)
		seen:=[]string{}
		for {
			var request struct {
				ID int `json:"id"`
				Method string `json:"method"`
				Params json.RawMessage `json:"params"`
			}
			if conn.ReadJSON(&request)!=nil{return}
			seen=append(seen,request.Method)
			switch request.Method {
			case "initialize":
				_ = conn.WriteJSON(map[string]any{"id":1,"result":map[string]any{}})
			case "initialized":
			case "thread/list":
				var params struct {
					Limit int `json:"limit"`
					UseStateDBOnly bool `json:"useStateDbOnly"`
				}
				if json.Unmarshal(request.Params,&params)!=nil ||
					params.Limit!=25 || !params.UseStateDBOnly ||
					strings.Join(seen,",")!="initialize,initialized,thread/list" {
					t.Errorf("observer used native write or unsafe list parameters: %v",seen)
					return
				}
				id:="thread-a";state:="idle"
				if n==2 {id="thread-b";state="notLoaded"}
				_ = conn.WriteJSON(map[string]any{"id":2,"result":map[string]any{
					"data":[]any{map[string]any{
						"id":id, "createdAt":1792490400, "cwd":"/home/user/project",
						"preview":"SENSITIVE_START_PROMPT",
						"status":map[string]string{"type":state},
					}}, "nextCursor":nil,
				}})
				// Echo a notification containing both a safe typed field and
				// a private payload. The observer must export only the status.
				if n==1 {
					_ = conn.WriteJSON(map[string]any{
						"method":"thread/status/changed",
						"params":map[string]any{
							"threadId":"thread-a",
							"status":map[string]string{"type":"active"},
							"prompt":"SENSITIVE_DELTA",
						},
					})
				}
				return // intentional native transport disconnect
			default:
				t.Errorf("non-read-only native RPC: %s",request.Method)
				return
			}
		}
	}))
	defer server.Close()
	address := "ws"+strings.TrimPrefix(server.URL,"http")
	var output bytes.Buffer
	err := streamNativeEvents(context.Background(), &output, 15*time.Second, 2,
		func()(*websocket.Conn,snapshot,error){return openObserverSocket(address)})
	if err==nil || !strings.Contains(err.Error(),"reconnection budget") {
		t.Fatalf("unexpected successful stream after early native disconnect: %v",err)
	}
	records:=readWatchRecords(t,output.Bytes())
	if connections.Load()!=2 || len(records)<5 {
		t.Fatalf("expected fresh native requery after disconnect: conns=%d events=%+v",connections.Load(),records)
	}
	if records[0].Connection!="observed" || records[0].Snapshot==nil ||
		records[0].Snapshot.Sessions[0].SessionID!="thread-a" ||
		records[1].Connection!="observed" || records[1].Snapshot.Sessions[0].Status!="active" ||
		records[2].Connection!="unavailable" || records[2].Snapshot!=nil ||
		records[3].Connection!="observed" || records[3].Snapshot.Sessions[0].SessionID!="thread-b" {
		t.Fatalf("event ordering, stale state or reconnection failed: %+v",records)
	}
	if strings.Contains(output.String(),"SENSITIVE_") || strings.Contains(output.String(),"/home/") {
		t.Fatal("raw native websocket data escaped into NDJSON")
	}
	for i, r := range records {
		if r.Sequence!=i+1 || r.LiveVerified || r.Source!="local-user-codex-watch" {
			t.Fatalf("wrong sequence/authority at %d: %+v",i,r)
		}
	}
}

func TestNativeEventBoundsAndDisconnectError(t *testing.T) {
	var output bytes.Buffer
	for _,tc:=range []struct{duration time.Duration; attempts int}{
		{time.Second,1},{100*time.Second,1},{15*time.Second,0},{15*time.Second,6},
	} {
		if err:=streamNativeEvents(context.Background(),&output,tc.duration,tc.attempts,
			func()(*websocket.Conn,snapshot,error){return nil,snapshot{},errors.New("offline")});err==nil{
			t.Fatal("accepted unbounded live observation")
		}
		if output.Len()!=0 {t.Fatal("invalid bounds wrote observation") }
	}
	ctx,cancel:=context.WithCancel(context.Background());cancel()
	if err:=streamNativeEvents(ctx,&output,15*time.Second,1,
		func()(*websocket.Conn,snapshot,error){t.Fatal("RPC ran after cancellation");return nil,snapshot{},nil});
		!errors.Is(err,context.Canceled) {
		t.Fatalf("cancelled event stream was not stopped: %v",err)
	}
}
