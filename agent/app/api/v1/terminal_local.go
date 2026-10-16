package v1

import (
	"crypto/sha256"
	"encoding/hex"
	"strconv"
	"strings"
	"time"

	"github.com/avaargsh/GPUPanel/agent/global"
	"github.com/avaargsh/GPUPanel/agent/utils/terminal"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// The Core authenticates and supplies the trusted owner headers over its private
// Agent connection. A fresh host needs no localhost SSH account or SSH daemon.
func (b *BaseApi) runLocalPTY(c *gin.Context) {
	ws, cols, rows, ok := prepareTerminalSession(c)
	if !ok {
		return
	}
	defer ws.Close()
	closeWith := func(reason string) {
		_ = ws.WriteControl(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.ClosePolicyViolation, reason), time.Now().Add(time.Second))
	}
	identity, ok := loadTerminalIdentity(c)
	if !ok {
		closeWith("missing terminal identity")
		return
	}
	if cols < 1 || rows < 1 || cols > 1000 || rows > 1000 {
		closeWith("invalid terminal dimensions")
		return
	}
	persistent, err := strconv.ParseBool(c.DefaultQuery("terminalPersistent", "false"))
	if err != nil {
		closeWith("invalid terminal persistence option")
		return
	}
	command := c.Query("command")
	if len(command) > 65536 {
		closeWith("terminal command too large")
		return
	}
	digest := sha256.Sum256([]byte(command))
	opts := terminal.SessionOptions{Identity: identity, Kind: "local", Target: hex.EncodeToString(digest[:]),
		Title: sanitizeTerminalTitle(c.Query("title")), Persistent: persistent, Cols: cols, Rows: rows}
	if err := terminal.ServeCommand(ws, strings.TrimSpace(c.Query("session")), opts, func() (*terminal.LocalCommand, error) {
		return terminal.NewHostShell(command)
	}); err != nil {
		global.LOG.Errorf("local terminal failed: %v", err)
		closeWith("local terminal unavailable")
	}
}
