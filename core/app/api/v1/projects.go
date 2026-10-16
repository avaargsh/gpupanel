package v1

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/avaargsh/GPUPanel/core/app/api/v1/helper"
	appauth "github.com/avaargsh/GPUPanel/core/app/auth"
	"github.com/avaargsh/GPUPanel/core/app/dto"
	"github.com/avaargsh/GPUPanel/core/app/workspace"
	"github.com/avaargsh/GPUPanel/core/global"
	"github.com/avaargsh/GPUPanel/core/init/session/psession"
	"github.com/gin-gonic/gin"
)

type projectCreateRequest struct {
	Name       string `json:"name"`
	SourceHint string `json:"sourceHint"`
}

func projectOwner(c *gin.Context) (string, bool) {
	c.Header("Cache-Control", "no-store")
	u, err := appauth.RequireAPIKeySession(c)
	// This first workstation slice is intentionally single-user local admin.
	// API keys, LOCAL_REQUEST, forwarded headers and enterprise/other accounts
	// are NOT silently granted write or read access to another user's projects.
	if err != nil || u.ID != psession.SuperAdminSessionUserID ||
		u.Role != "ADMIN" || u.Name == "" {
		c.AbortWithStatusJSON(http.StatusForbidden, dto.Response{
			Code: http.StatusForbidden, Message: "SessionRequired",
		})
		return "", false
	}
	return u.ID, true
}

func (b *BaseApi) ListProjects(c *gin.Context) {
	owner, ok := projectOwner(c)
	if !ok { return }
	items, err := workspace.New(global.DB).List(c.Request.Context(), owner)
	if err != nil {
		helper.InternalServer(c, errors.New("project registry unavailable"))
		return
	}
	helper.SuccessWithData(c, items)
}

func (b *BaseApi) CreateProject(c *gin.Context) {
	owner, ok := projectOwner(c)
	if !ok { return }
	var req projectCreateRequest
	decoder := json.NewDecoder(http.MaxBytesReader(c.Writer, c.Request.Body, 4096))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&req); err != nil {
		helper.BadRequest(c, errors.New("invalid project registration"))
		return
	}
	if err := decoder.Decode(new(interface{})); err != io.EOF {
		helper.BadRequest(c, errors.New("unexpected request payload"))
		return
	}
	item, err := workspace.New(global.DB).Create(
		c.Request.Context(), owner, req.Name, req.SourceHint,
	)
	switch {
	case errors.Is(err, workspace.ErrInvalidInput):
		helper.BadRequest(c, errors.New("invalid project metadata"))
	case errors.Is(err, workspace.ErrConflict), errors.Is(err, workspace.ErrLimit):
		c.AbortWithStatusJSON(http.StatusConflict, dto.Response{
			Code: http.StatusConflict, Message: "ProjectRegistrationConflict",
		})
	case err != nil:
		helper.InternalServer(c, errors.New("project registry unavailable"))
	default:
		helper.SuccessWithData(c, item)
	}
}
