package router

import (
	v1 "github.com/avaargsh/GPUPanel/core/app/api/v1"
	"github.com/avaargsh/GPUPanel/core/middleware"
	"github.com/gin-gonic/gin"
)

type ScriptRouter struct{}

func (s *ScriptRouter) InitRouter(Router *gin.RouterGroup) {
	scriptRouter := Router.Group("script").
		Use(middleware.SessionAuth()).
		Use(middleware.PasswordExpired())
	baseApi := v1.ApiGroupApp.BaseApi
	{
		scriptRouter.POST("", baseApi.CreateScript)
		scriptRouter.POST("/search", baseApi.SearchScript)
		scriptRouter.POST("/del", baseApi.DeleteScript)
		scriptRouter.POST("/update", baseApi.UpdateScript)
		scriptRouter.POST("/sync", baseApi.SyncScript)
		scriptRouter.GET("/run", baseApi.RunScript)
	}
}
