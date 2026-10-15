package router

import (
	v1 "github.com/avaargsh/GPUPanel/core/app/api/v1"
	"github.com/avaargsh/GPUPanel/core/middleware"
	"github.com/gin-gonic/gin"
)

type CommandRouter struct{}

func (s *CommandRouter) InitRouter(Router *gin.RouterGroup) {
	commandRouter := Router.Group("commands").
		Use(middleware.SessionAuth()).
		Use(middleware.PasswordExpired())
	baseApi := v1.ApiGroupApp.BaseApi
	{
		commandRouter.POST("/list", baseApi.ListCommand)
		commandRouter.POST("", baseApi.CreateCommand)
		commandRouter.POST("/del", baseApi.DeleteCommand)
		commandRouter.POST("/search", baseApi.SearchCommand)
		commandRouter.POST("/tree", baseApi.SearchCommandTree)
		commandRouter.POST("/update", baseApi.UpdateCommand)
		commandRouter.POST("/export", baseApi.ExportCommands)
		commandRouter.POST("/upload", baseApi.UploadCommandCsv)
		commandRouter.POST("/import", baseApi.ImportCommands)
	}
}
