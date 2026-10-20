// codex-observer is a non-root, explicit-loopback, read-only client for an
// ALREADY running app-server WebSocket. It does not spawn or control Codex.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net"
	"net/url"
	"os"
	"os/user"
	"os/signal"
	"syscall"
	"path"
	"regexp"
	"runtime"
	"unicode"
	"unicode/utf8"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

const maxRows = 25
var nativeID = regexp.MustCompile(`^[A-Za-z0-9_.:-]{1,128}$`)

type session struct {
	SessionID string `json:"sessionId"`
	Runtime string `json:"runtimeKind"`
	Project string `json:"projectLabel"`
	Started string `json:"startedAt"`
	Liveness string `json:"liveness"`
	Status string `json:"observerStatus"`
}
type snapshot struct {
	Version int `json:"schemaVersion"`
	Source string `json:"source"`
	ReadOnly bool `json:"readOnly"`
	Verified bool `json:"liveStatusVerified"`
	Scope string `json:"observerScope"`
	HasMore bool `json:"hasMore"`
	Sessions []session `json:"sessions"`
}
type rpcFrame struct {
	ID *int `json:"id"`
	Result json.RawMessage `json:"result"`
	Error json.RawMessage `json:"error"`
}
type thread struct {
	ID string `json:"id"`
	Created json.Number `json:"createdAt"`
	CWD string `json:"cwd"`
	Status struct { Type string `json:"type"` } `json:"status"`
}
type page struct {
	Data []thread `json:"data"`
	NextCursor *string `json:"nextCursor"`
}

func endpoint(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil || u == nil || u.Scheme != "ws" || u.Hostname() != "127.0.0.1" ||
		u.User != nil || u.RawQuery != "" || u.Fragment != "" ||
		(u.Path != "" && u.Path != "/") || u.RawPath != "" {
		return "", errors.New("only an explicit 127.0.0.1 WebSocket endpoint is allowed")
	}
	port, err := strconv.Atoi(u.Port())
	if err != nil || port < 1024 || port > 65535 || !strings.HasPrefix(raw, "ws://127.0.0.1:") {
		return "", errors.New("invalid loopback port")
	}
	return "ws://" + net.JoinHostPort("127.0.0.1", strconv.Itoa(port)), nil
}

func userFence() error {
	if runtime.GOOS != "linux" || os.Getuid() == 0 || os.Getuid() != os.Geteuid() {
		return errors.New("must run as non-root Linux user")
	}
	account, err := user.Current()
	if err != nil || account.Uid != strconv.Itoa(os.Getuid()) ||
		account.HomeDir != path.Join("/home", account.Username) ||
		os.Getenv("HOME") != account.HomeDir {
		return errors.New("unsupported Linux login user identity")
	}
	return nil
}

func readReply(conn *websocket.Conn, id int, deadline time.Time) (json.RawMessage, error) {
	for frames := 0; frames < 100; frames++ {
		if err := conn.SetReadDeadline(deadline); err != nil { return nil, err }
		_, payload, err := conn.ReadMessage()
		if err != nil { return nil, err }
		var frame rpcFrame
		if err := json.Unmarshal(payload, &frame); err != nil { return nil, errors.New("invalid native RPC") }
		if frame.ID == nil { continue } // never respond to unexpected notifications
		if *frame.ID != id || len(frame.Error) != 0 || len(frame.Result) == 0 {
			return nil, errors.New("unexpected native RPC response")
		}
		return frame.Result, nil
	}
	return nil, errors.New("native event stream over budget")
}

func printableLabel(label string) bool {
	for _, c := range label {
		if !unicode.IsPrint(c) || c == '/' || c == '\\' { return false }
	}
	return true
}

func project(result json.RawMessage) (snapshot, error) {
	var pg page
	if err := json.Unmarshal(result, &pg); err != nil || pg.Data == nil ||
		len(pg.Data) > maxRows || pg.NextCursor != nil && (len(*pg.NextCursor) == 0 || len(*pg.NextCursor) > 4096) {
		return snapshot{}, errors.New("invalid native page")
	}
	out := snapshot{Version:2, Source:"local-user-codex-appserver",
		ReadOnly:true, Verified:false, Scope:"attached-loopback-appserver",
		HasMore:pg.NextCursor != nil, Sessions:make([]session, 0, len(pg.Data))}
	seen := map[string]bool{}
	for _, row := range pg.Data {
		if !nativeID.MatchString(row.ID) || seen[row.ID] {
			return snapshot{}, errors.New("invalid native thread identifier")
		}
		seen[row.ID] = true
		ts, err := row.Created.Int64()
		if err != nil || ts < 946684800 || ts > 4102444800 {
			return snapshot{}, errors.New("invalid native timestamp")
		}
		switch row.Status.Type {
		case "notLoaded", "idle", "active", "systemError":
		default: return snapshot{}, errors.New("unsupported native thread state")
		}
		label := "未标记项目"
		if strings.HasPrefix(row.CWD, "/") && len(row.CWD) <= 4096 {
			name := path.Base(row.CWD)
			if len(name) > 0 && len(name) <= 80 && name != "." && name != "/" &&
				utf8.ValidString(name) && printableLabel(name) {
				label = name
			}
		}
		out.Sessions = append(out.Sessions, session{
			SessionID:row.ID, Runtime:"codex", Project:label,
			Started:time.Unix(ts,0).UTC().Format(time.RFC3339),
			Liveness:"unknown", Status:row.Status.Type,
		})
	}
	return out,nil
}

// openObserverSocket performs the same read-only handshake for one-shot or
// notifications. The caller owns the returned connection and must close it.
// Every reconnect reruns DB-only thread/list; no cached state is accepted.
func openObserverSocket(raw string) (*websocket.Conn, snapshot, error) {
	address, err := endpoint(raw)
	if err != nil { return nil, snapshot{}, err }
	dialer := websocket.Dialer{HandshakeTimeout:4*time.Second, EnableCompression:false}
	conn, _, err := dialer.Dial(address, nil)
	if err != nil { return nil, snapshot{}, errors.New("local native app-server unavailable") }
	conn.SetReadLimit(512 * 1024)
	deadline := time.Now().Add(10*time.Second)
	send := func(req any) error {
		if err := conn.SetWriteDeadline(deadline); err != nil { return err }
		return conn.WriteJSON(req)
	}
	fail := func(e error) (*websocket.Conn, snapshot, error) {
		_ = conn.Close()
		return nil, snapshot{}, e
	}
	if err := send(map[string]any{"id":1,"method":"initialize","params":map[string]any{
		"clientInfo":map[string]string{"name":"gpupanel_local_observer","title":"GPUPanel Local Observer","version":"0.1.0"},
	}}); err != nil { return fail(errors.New("native initialize failed")) }
	if _, err := readReply(conn,1,deadline); err != nil { return fail(err) }
	if err := send(map[string]any{"method":"initialized","params":map[string]any{}}); err != nil {
		return fail(errors.New("native initialization failed"))
	}
	if err := send(map[string]any{"id":2,"method":"thread/list","params":map[string]any{
		"limit":maxRows,"sortKey":"created_at","useStateDbOnly":true,
	}}); err != nil { return fail(errors.New("native read failed")) }
	result, err := readReply(conn,2,deadline)
	if err != nil { return fail(err) }
	snap, err := project(result)
	if err != nil { return fail(err) }
	return conn, snap, nil
}

func observe(raw string) (snapshot, error) {
	conn, snap, err := openObserverSocket(raw)
	if err != nil { return snapshot{}, err }
	defer conn.Close()
	return snap, nil
}

func main() {
	flag.Usage = func() {
		fmt.Fprintln(os.Stderr, "usage: codex-observer --endpoint ws://127.0.0.1:PORT [--watch --samples 12 --interval-seconds 5]")
	}
	raw := flag.String("endpoint", "", "existing local Codex app-server websocket")
	watchMode := flag.Bool("watch", false, "finite repeated read-only snapshots")
	eventMode := flag.Bool("events", false, "finite native status notification observation on one WebSocket")
	duration := flag.Int("duration-seconds", 60, "event observation upper duration, 15-90 seconds")
	attempts := flag.Int("attempts", 3, "event observation connection attempts, 1-5")
	samples := flag.Int("samples", 12, "watch-only, finite number of observations (1-120)")
	interval := flag.Int("interval-seconds", 5, "watch-only, seconds between attempts (3-60)")
	flag.Parse()
	if flag.NArg()!=0 || *raw=="" || userFence()!=nil {
		flag.Usage()
		os.Exit(2)
	}
	if _,err:=endpoint(*raw);err!=nil {
		flag.Usage()
		os.Exit(2)
	}
	if *watchMode && *eventMode {
		flag.Usage()
		os.Exit(2)
	}
	if *eventMode {
		ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
		defer stop()
		if err := eventStream(ctx, os.Stdout, *raw, *duration, *attempts); err != nil &&
			!errors.Is(err, context.Canceled) {
			fmt.Fprintln(os.Stderr, "Native event observation unavailable; no authority inferred")
			os.Exit(2)
		}
		return
	}
	if *watchMode {
		ctx,stop:=signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
		defer stop()
		if err:=watch(ctx,os.Stdout,*samples,time.Duration(*interval)*time.Second,
			func()(snapshot,error){return observe(*raw)});err!=nil &&
			!errors.Is(err,context.Canceled) {
			fmt.Fprintln(os.Stderr,"Bounded native observation stopped without further data")
			os.Exit(2)
		}
		return
	}
	data,err := observe(*raw)
	if err != nil {
		// Native errors may contain commands, secrets or filesystem paths.
		fmt.Fprintln(os.Stderr,"Codex observation unavailable (no export)")
		os.Exit(2)
	}
	_ = json.NewEncoder(os.Stdout).Encode(data)
}
