package router

import (
	v1 "github.com/avaargsh/GPUPanel/agent/app/api/v1"
	"github.com/gin-gonic/gin"
)

type RuntimeDiagnosticsRouter struct{}

func (s *RuntimeDiagnosticsRouter) InitRouter(Router *gin.RouterGroup) {
	diagnosticsRouter := Router.Group("hosts/diagnostics")
	baseApi := v1.ApiGroupApp.BaseApi
	{
		diagnosticsRouter.GET("/summary", baseApi.LoadRuntimeDiagnosticsSummary)
		diagnosticsRouter.GET("/goroutines", baseApi.LoadRuntimeGoroutines)
		diagnosticsRouter.POST("/profiles", baseApi.CreateRuntimeProfile)
	}
}
