package router

import (
	"net/http"
	"path"
	"strings"

	"github.com/avaargsh/GPUPanel/core/global"
	"github.com/avaargsh/GPUPanel/core/init/session/psession"
	"github.com/gin-gonic/gin"
)

func isHostOperationPath(p string) bool {
	clean := path.Clean(p)
	return clean == "/api/v1/hosts/operations" || strings.HasPrefix(clean, "/api/v1/hosts/operations/")
}
func authorizeHostOperations(c *gin.Context, node string) bool {
	if !isHostOperationPath(c.Request.URL.Path) {
		return true
	}
	c.Header("Cache-Control", "no-store")
	if c.GetBool("API_AUTH") || (node != "" && node != "local") || global.SESSION == nil {
		c.AbortWithStatus(http.StatusForbidden)
		return false
	}
	user, err := global.SESSION.Get(c)
	if err != nil || user.ID != psession.SuperAdminSessionUserID || user.Role != "ADMIN" || user.Name == "" {
		c.AbortWithStatus(http.StatusForbidden)
		return false
	}
	return true
}
