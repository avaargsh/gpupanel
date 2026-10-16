package v1

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/avaargsh/GPUPanel/agent/app/model"
	"github.com/avaargsh/GPUPanel/agent/global"
	"github.com/avaargsh/GPUPanel/agent/utils/terminal"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/gorilla/websocket"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"
)

func TestLocalPTYRequiresOwnerAndWorksWithoutSSHSettings(t *testing.T) {
	oldDB, oldLog := global.DB, global.LOG
	t.Cleanup(func() { global.DB = oldDB; global.LOG = oldLog })
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "test.db")), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.Setting{}); err != nil {
		t.Fatal(err)
	}
	global.DB = db
	global.LOG = logrus.New()
	router := gin.New()
	router.GET("/local", func(c *gin.Context) {
		if owner := c.GetHeader("Test-Owner"); owner == "fixture" || owner == "other" {
			c.Request.Header.Set(terminal.HeaderUserID, owner)
			authSession := "session-" + owner
			if override := c.GetHeader("Test-Session"); override != "" {
				authSession = override
			}
			c.Request.Header.Set(terminal.HeaderAuthSessionID, authSession)
			if lease := c.GetHeader("Test-Lease"); lease != "" {
				c.Request.Header.Set(terminal.HeaderAuthLeaseUntil, lease)
			}
		}
		(&BaseApi{}).WsLocalTerminal(c)
	})
	server := httptest.NewServer(router)
	defer server.Close()
	endpoint := "ws" + strings.TrimPrefix(server.URL, "http") + "/local?cols=80&rows=24&command="
	marker := filepath.Join(t.TempDir(), "denied")
	ws, _, err := websocket.DefaultDialer.Dial(endpoint+url.QueryEscape("touch '"+marker+"'"), nil)
	if err != nil {
		t.Fatal(err)
	}
	_ = ws.SetReadDeadline(time.Now().Add(3 * time.Second))
	_, _, err = ws.ReadMessage()
	_ = ws.Close()
	if err == nil {
		t.Fatal("ownerless terminal was not closed")
	}
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Fatal("ownerless request executed")
	}
	ws, _, err = websocket.DefaultDialer.Dial(endpoint+url.QueryEscape("printf 'PTY_REAL_OUTPUT'; sleep 5"), http.Header{"Test-Owner": []string{"fixture"}})
	if err != nil {
		t.Fatal(err)
	}
	defer ws.Close()
	_ = ws.SetReadDeadline(time.Now().Add(5 * time.Second))
	var output, sessionID string
	for !strings.Contains(output, "PTY_REAL_OUTPUT") {
		var msg terminal.WsMsg
		if err := ws.ReadJSON(&msg); err != nil {
			t.Fatal(err)
		}
		if msg.Type == terminal.WsMsgSession {
			sessionID = msg.ID
		}
		if msg.Type == terminal.WsMsgCmd {
			data, err := base64.StdEncoding.DecodeString(msg.Data)
			if err != nil {
				t.Fatal(err)
			}
			output += string(data)
		}
	}
	if sessionID == "" {
		t.Fatal("missing session receipt")
	}
	foreign, _, err := websocket.DefaultDialer.Dial(endpoint+url.QueryEscape("printf 'PTY_REAL_OUTPUT'; sleep 5")+"&session="+sessionID, http.Header{"Test-Owner": []string{"other"}})
	if err != nil {
		t.Fatal(err)
	}
	_ = foreign.SetReadDeadline(time.Now().Add(3 * time.Second))
	_, _, err = foreign.ReadMessage()
	_ = foreign.Close()
	if !websocket.IsCloseError(err, terminal.CloseCodeSessionNotFound) {
		t.Fatalf("foreign owner attached: %v", err)
	}

	// A new login by the *same* user is not the same authorization session.
	// A stolen old session ID must not grant access to a privileged PTY.
	relogin, _, err := websocket.DefaultDialer.Dial(
		endpoint+url.QueryEscape("printf 'PTY_REAL_OUTPUT'; sleep 5")+"&session="+sessionID,
		http.Header{"Test-Owner": []string{"fixture"}, "Test-Session": []string{"session-fixture-new-login"}},
	)
	if err != nil {
		t.Fatal(err)
	}
	_ = relogin.SetReadDeadline(time.Now().Add(3 * time.Second))
	_, _, err = relogin.ReadMessage()
	_ = relogin.Close()
	if !websocket.IsCloseError(err, terminal.CloseCodeSessionNotFound) {
		t.Fatalf("same user with new login attached to old PTY: %v", err)
	}

	// Even a correctly identified user must not start a shell with an expired
	// delegated authorization lease; check the external marker, not a toast.
	expiredMarker := filepath.Join(t.TempDir(), "expired-lease-must-not-run")
	expired, _, err := websocket.DefaultDialer.Dial(
		endpoint+url.QueryEscape("touch '"+expiredMarker+"'"),
		http.Header{
			"Test-Owner": []string{"fixture"},
			"Test-Lease": []string{strconv.FormatInt(time.Now().Add(-time.Minute).UnixMilli(), 10)},
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	_ = expired.SetReadDeadline(time.Now().Add(3 * time.Second))
	_, _, err = expired.ReadMessage()
	_ = expired.Close()
	if !websocket.IsCloseError(err, websocket.ClosePolicyViolation) {
		t.Fatalf("expired lease was not rejected: %v", err)
	}
	if _, err := os.Stat(expiredMarker); !os.IsNotExist(err) {
		t.Fatal("expired authorization executed a host command")
	}

	_ = ws.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""), time.Now().Add(time.Second))
}
