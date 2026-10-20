// codex-observer is a non-root, explicit-loopback, read-only client for an
// ALREADY running app-server WebSocket. It does not spawn or control Codex.
package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net"
	"net/url"
	"os"
	"os/user"
	"path"
	"regexp"
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
	if os.Getuid() == 0 || os.Getuid() != os.Geteuid() {
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
				!strings.ContainsAny(name, "\r\n\t") {
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

func observe(raw string) (snapshot, error) {
	address, err := endpoint(raw)
	if err != nil { return snapshot{}, err }
	dialer := websocket.Dialer{HandshakeTimeout:4*time.Second, EnableCompression:false}
	conn, _, err := dialer.Dial(address, nil)
	if err != nil { return snapshot{}, errors.New("local native app-server unavailable") }
	defer conn.Close()
	conn.SetReadLimit(512 * 1024)
	deadline := time.Now().Add(10*time.Second)
	send := func(req any) error {
		if err := conn.SetWriteDeadline(deadline); err != nil { return err }
		return conn.WriteJSON(req)
	}
	if err := send(map[string]any{"id":1,"method":"initialize","params":map[string]any{
		"clientInfo":map[string]string{"name":"gpupanel_local_observer","title":"GPUPanel Local Observer","version":"0.1.0"},
	}}); err != nil { return snapshot{}, errors.New("native initialize failed") }
	if _, err := readReply(conn,1,deadline); err != nil { return snapshot{}, err }
	if err := send(map[string]any{"method":"initialized","params":map[string]any{}}); err != nil {
		return snapshot{}, errors.New("native initialization failed")
	}
	if err := send(map[string]any{"id":2,"method":"thread/list","params":map[string]any{
		"limit":maxRows,"sortKey":"created_at","useStateDbOnly":true,
	}}); err != nil { return snapshot{}, errors.New("native read failed") }
	result, err := readReply(conn,2,deadline)
	if err != nil { return snapshot{}, err }
	return project(result)
}

func main() {
	flag.Usage = func() { fmt.Fprintln(os.Stderr, "usage: codex-observer --endpoint ws://127.0.0.1:PORT") }
	raw := flag.String("endpoint", "", "existing local Codex app-server websocket")
	flag.Parse()
	if flag.NArg()!=0 || *raw=="" || userFence()!=nil {
		flag.Usage()
		os.Exit(2)
	}
	data,err := observe(*raw)
	if err != nil {
		// Native errors may contain commands, secrets or filesystem paths.
		fmt.Fprintln(os.Stderr,"Codex observation unavailable (no export)")
		os.Exit(2)
	}
	_ = json.NewEncoder(os.Stdout).Encode(data)
}
