package v1

import (
	"github.com/avaargsh/GPUPanel/agent/app/api/v1/helper"
	"github.com/gin-gonic/gin"
)

// @Tags Health
// @Summary Check health
// @Success 200
// @Security ApiKeyAuth
// @Security Timestamp
// @Router /health/check [get]
func (b *BaseApi) CheckHealth(c *gin.Context) {
	helper.Success(c)
}
