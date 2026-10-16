package router

import (
	v1 "github.com/avaargsh/GPUPanel/core/app/api/v1"
	"github.com/avaargsh/GPUPanel/core/middleware"
	"github.com/gin-gonic/gin"
)

type ProjectRouter struct{}

func (s *ProjectRouter) InitRouter(root *gin.RouterGroup) {
	group := root.Group("projects").
		Use(middleware.SessionAuth()).
		Use(middleware.PasswordExpired())
	api := v1.ApiGroupApp.BaseApi
	group.GET("", api.ListProjects)
	group.GET("/:id", api.GetProject)
	group.GET("/:id/workspaces/:workspaceId/provision-plan", api.PreviewWorkspaceProvision)
	group.POST("/:id/workspaces/:workspaceId/provision-intent", api.RequestWorkspaceProvision)
	group.GET("/:id/workspaces/:workspaceId/local-evidence", api.GetWorkspaceLocalEvidence)
	group.POST("/:id/workspaces/:workspaceId/local-evidence", api.ReportWorkspaceLocalEvidence)
	group.POST("", api.CreateProject)
}
