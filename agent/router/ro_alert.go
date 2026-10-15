package router

import (
	v1 "github.com/avaargsh/GPUPanel/agent/app/api/v1"
	"github.com/gin-gonic/gin"
)

type AlertRouter struct {
}

func (a *AlertRouter) InitRouter(Router *gin.RouterGroup) {
	alertRouter := Router.Group("alert")
	baseApi := v1.ApiGroupApp.BaseApi
	{
		alertRouter.POST("", baseApi.CreateAlert)
		alertRouter.POST("/update", baseApi.UpdateAlert)
		alertRouter.POST("/search", baseApi.PageAlert)
		alertRouter.POST("/status", baseApi.UpdateAlertStatus)
		alertRouter.POST("/del", baseApi.DeleteAlert)
		alertRouter.GET("/disks/list", baseApi.GetDisks)
		alertRouter.POST("/logs/search", baseApi.PageAlertLogs)
		alertRouter.POST("/logs/clean", baseApi.CleanAlertLogs)
		alertRouter.GET("/clams/list", baseApi.GetClams)
		alertRouter.POST("/cronjob/list", baseApi.GetCronJobs)

		alertRouter.POST("/config/update", baseApi.UpdateAlertConfig)
		alertRouter.POST("/config/status", baseApi.UpdateAlertConfigStatus)
		alertRouter.POST("/config/info", baseApi.GetAlertConfig)
		alertRouter.POST("/config/search", baseApi.PageAlertConfig)
		alertRouter.POST("/config/del", baseApi.DeleteAlertConfig)
		alertRouter.POST("/config/test", baseApi.TestAlertConfig)
	}
}
