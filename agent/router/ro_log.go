package router

import (
	v1 "github.com/avaargsh/GPUPanel/agent/app/api/v1"
	"github.com/gin-gonic/gin"
)

type LogRouter struct{}

func (s *LogRouter) InitRouter(Router *gin.RouterGroup) {
	operationRouter := Router.Group("logs")
	baseApi := v1.ApiGroupApp.BaseApi
	{
		operationRouter.GET("/system/files", baseApi.GetSystemFiles)
		operationRouter.GET("/system/status", baseApi.GetSystemLogStatus)
		operationRouter.POST("/system/read", baseApi.ReadSystemLog)
		operationRouter.GET("/system/services", baseApi.ListRunningServices)
		operationRouter.POST("/tasks/search", baseApi.PageTasks)
		operationRouter.POST("/tasks/read", baseApi.ReadTaskLogByLine)
		operationRouter.GET("/tasks/executing/count", baseApi.CountExecutingTasks)
	}
}
