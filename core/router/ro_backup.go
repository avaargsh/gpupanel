package router

import (
	v1 "github.com/avaargsh/GPUPanel/core/app/api/v1"
	"github.com/avaargsh/GPUPanel/core/middleware"
	"github.com/gin-gonic/gin"
)

type BackupRouter struct{}

func (s *BackupRouter) InitRouter(Router *gin.RouterGroup) {
	backupRouter := Router.Group("backups").
		Use(middleware.SessionAuth()).
		Use(middleware.PasswordExpired())
	baseApi := v1.ApiGroupApp.BaseApi
	{
		backupRouter.GET("/client/:clientType", baseApi.LoadBackupClientInfo)
		backupRouter.POST("/refresh/token", baseApi.RefreshToken)
		backupRouter.POST("", baseApi.CreateBackup)
		backupRouter.POST("/del", baseApi.DeleteBackup)
		backupRouter.POST("/update", baseApi.UpdateBackup)
	}
}
