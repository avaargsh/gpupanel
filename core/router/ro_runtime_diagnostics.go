package router

import (
	v1 "github.com/avaargsh/GPUPanel/core/app/api/v1"
	"github.com/avaargsh/GPUPanel/core/middleware"
	"github.com/gin-gonic/gin"
)

type RuntimeDiagnosticsRouter struct{}

func (s *RuntimeDiagnosticsRouter) InitRouter(Router *gin.RouterGroup) {
	diagnosticsRouter := Router.Group("hosts/diagnostics").
		Use(middleware.SessionAuth()).
		Use(middleware.PasswordExpired())
	baseApi := v1.ApiGroupApp.BaseApi
	{
		diagnosticsRouter.GET("/summary", baseApi.LoadRuntimeDiagnosticsSummary)
		diagnosticsRouter.GET("/goroutines", baseApi.LoadRuntimeGoroutines)
		diagnosticsRouter.POST("/profiles", baseApi.CreateRuntimeProfile)
	}
}
