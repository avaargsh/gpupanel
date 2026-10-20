package router

import (
	v1 "github.com/avaargsh/GPUPanel/core/app/api/v1"
	"github.com/avaargsh/GPUPanel/core/middleware"
	"github.com/gin-gonic/gin"
)

// The shared SessionAuth middleware is not a grant: the API handler also
// rejects API credentials, LOCAL_REQUEST and all non-loopback connections.
type NativePrincipalRouter struct{}
func (NativePrincipalRouter) InitRouter(root *gin.RouterGroup) {
	group:=root.Group("native-principal").
		Use(middleware.SessionAuth()).Use(middleware.PasswordExpired())
	api:=v1.ApiGroupApp.BaseApi
	group.POST("/begin",api.BeginNativePrincipal)
	group.GET("/status",api.NativePrincipalStatus)
	group.POST("/revoke",api.RevokeNativePrincipal)
}
