package v1

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/avaargsh/GPUPanel/agent/app/hostops"
	"github.com/avaargsh/GPUPanel/agent/global"
	"github.com/avaargsh/GPUPanel/agent/utils/terminal"
	"github.com/gin-gonic/gin"
)

func operationOwner(c *gin.Context) (string, bool) {
	// Only the Core can reach this private Agent socket. Public Core clears spoofed
	// headers, rejects API keys/remote scope and forwards a current admin identity.
	id, ok := loadTerminalIdentity(c)
	if !ok || id.UserID != "__super_admin__" || strings.HasPrefix(id.AuthSessionID, "api:") || strings.HasPrefix(id.AuthSessionID, "api-key:") {
		c.AbortWithStatus(http.StatusForbidden)
		return "", false
	}
	if c.GetHeader(terminal.HeaderUserID) == "" {
		c.AbortWithStatus(http.StatusForbidden)
		return "", false
	}
	c.Header("Cache-Control", "no-store")
	return id.UserID + ":" + id.AuthSessionID, true
}
func decodeOperation(c *gin.Context, out interface{}) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 2048)
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if decoder.Decode(out) != nil || decoder.Decode(new(interface{})) != io.EOF {
		c.AbortWithStatus(http.StatusBadRequest)
		return false
	}
	return true
}
func operationResponse(c *gin.Context, data interface{}, err error) {
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"code": 409, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 200, "message": "", "data": data})
}
func operationEngine() hostops.Engine {
	return hostops.Engine{DB: global.TaskDB, Runner: hostops.LocalRunner{}}
}
func (b *BaseApi) PlanHostOperation(c *gin.Context) {
	owner, ok := operationOwner(c)
	if !ok {
		return
	}
	var req hostops.PlanRequest
	if !decodeOperation(c, &req) {
		return
	}
	data, err := operationEngine().Plan(c.Request.Context(), owner, req)
	operationResponse(c, operationView(data), err)
}
func (b *BaseApi) ConfirmHostOperation(c *gin.Context) {
	owner, ok := operationOwner(c)
	if !ok {
		return
	}
	var req hostops.ConfirmRequest
	if !decodeOperation(c, &req) {
		return
	}
	data, err := operationEngine().Execute(c.Request.Context(), owner, c.Param("operationId"), req)
	operationResponse(c, operationView(data), err)
}
func (b *BaseApi) GetHostOperation(c *gin.Context) {
	owner, ok := operationOwner(c)
	if !ok {
		return
	}
	data, err := operationEngine().Get(owner, c.Param("operationId"))
	operationResponse(c, operationView(data), err)
}
func (b *BaseApi) ListHostOperations(c *gin.Context) {
	owner, ok := operationOwner(c)
	if !ok {
		return
	}
	data, err := operationEngine().List(owner)
	views := make([]hostOperationView, 0, len(data))
	for _, row := range data {
		views = append(views, operationView(row))
	}
	operationResponse(c, views, err)
}

type principalPreflightRequest struct {
	UID int64 `json:"uid"`
}

// PreflightWorkspaceLinuxUser shares the already protected local-only
// HostOperations Core proxy boundary. It does not bind a Workspace or
// authorize worker execution and never changes an OS account.
func (b *BaseApi) PreflightWorkspaceLinuxUser(c *gin.Context) {
	if _, ok := operationOwner(c); !ok {
		return
	}
	var req principalPreflightRequest
	if !decodeOperation(c, &req) {
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"code": 200, "message": "",
		"data": hostops.InspectLinuxPrincipal(req.UID),
	})
}
