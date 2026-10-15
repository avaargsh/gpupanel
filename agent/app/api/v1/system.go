package v1

import (
	"errors"
	"github.com/avaargsh/GPUPanel/agent/app/api/v1/helper"
	"github.com/gin-gonic/gin"
)

// @Tags Host
// @Summary Check if a system component exists
// @Accept json
// @Param name path string true "Component name to check (e.g., rsync, docker)"
// @Success 200 {object} response.ComponentInfo
// @Security ApiKeyAuth
// @Security Timestamp
// @Router /hosts/components/{name} [get]
func (b *BaseApi) CheckComponentExistence(c *gin.Context) {
	name := c.Param("name")
	if name == "" {
		helper.BadRequest(c, errors.New("empty component name"))
		return
	}

	info := systemService.IsComponentExist(name)
	helper.SuccessWithData(c, info)
}
