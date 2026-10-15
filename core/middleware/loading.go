package middleware

import (
	"github.com/avaargsh/GPUPanel/core/app/api/v1/helper"
	"github.com/avaargsh/GPUPanel/core/app/repo"
	"github.com/gin-gonic/gin"
)

func GlobalLoading() gin.HandlerFunc {
	return func(c *gin.Context) {
		settingRepo := repo.NewISettingRepo()
		status, err := settingRepo.GetValueByKey("SystemStatus")
		if err != nil {
			helper.InternalServer(c, err)
			return
		}
		if status != "Free" {
			helper.ErrorWithDetail(c, 407, status, err)
			return
		}
		c.Next()
	}
}
