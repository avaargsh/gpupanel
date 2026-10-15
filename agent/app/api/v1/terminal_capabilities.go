package v1

import (
	"github.com/avaargsh/GPUPanel/agent/app/api/v1/helper"
	"github.com/gin-gonic/gin"
)

func (b *BaseApi) TerminalCapabilities(c *gin.Context) {
	helper.SuccessWithData(c, gin.H{"apiKeyLeaseVersion": 1})
}
