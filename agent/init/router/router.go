package router

import (
	v1 "github.com/avaargsh/GPUPanel/agent/app/api/v1"
	"github.com/avaargsh/GPUPanel/agent/global"
	"github.com/avaargsh/GPUPanel/agent/i18n"
	"github.com/avaargsh/GPUPanel/agent/middleware"
	rou "github.com/avaargsh/GPUPanel/agent/router"
	"github.com/gin-gonic/gin"
)

var (
	Router *gin.Engine
)

func Routers() *gin.Engine {
	Router = gin.Default()
	Router.Use(i18n.UseI18n())

	PrivateGroup := Router.Group("/api/v1")
	if !global.IsMaster {
		PrivateGroup.Use(middleware.Certificate())
	}
	PrivateGroup.Use(middleware.OperationResolveMeta())
	for _, router := range rou.RouterGroupApp {
		router.InitRouter(PrivateGroup)
	}
	PrivateGroup.GET("/health/check", v1.ApiGroupApp.BaseApi.CheckHealth)

	return Router
}
