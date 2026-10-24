package router

import (
	v1 "github.com/avaargsh/GPUPanel/core/app/api/v1"
	"github.com/avaargsh/GPUPanel/core/middleware"
	"github.com/gin-gonic/gin"
)

// No route for VM start, stop, reboot, delete or libvirt inventory.
type VMAccessRouter struct{}

func (VMAccessRouter) InitRouter(root *gin.RouterGroup) {
	group:=root.Group("vms").Use(middleware.SessionAuth()).Use(middleware.PasswordExpired())
	group.GET("/access",v1.ApiGroupApp.BaseApi.VMAccessStatus)
}
