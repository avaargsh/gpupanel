package middleware

import (
	"net"
	"strings"

	"github.com/avaargsh/GPUPanel/core/app/api/v1/helper"
	"github.com/avaargsh/GPUPanel/core/app/repo"
	"github.com/avaargsh/GPUPanel/core/utils/common"
	"github.com/avaargsh/GPUPanel/core/utils/security"
	"github.com/gin-gonic/gin"
)

func WhiteAllow() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenString := c.GetHeader("X-Panel-Local-Token")
		remoteIP := common.GetRealClientIP(c)
		if isLocalSyncRequest(c.Request.URL.Path, remoteIP, tokenString) {
			c.Set("LOCAL_REQUEST", true)
			c.Next()
			return
		}

		settingRepo := repo.NewISettingRepo()
		trustedProxies, err := settingRepo.GetValueByKey("AllowIPTrustedProxies")
		if err != nil {
			helper.InternalServer(c, err)
			return
		}
		clientIP := common.ResolveClientIP(c, trustedProxies)

		allowIPs, err := settingRepo.GetValueByKey("AllowIPs")
		if err != nil {
			helper.InternalServer(c, err)
			return
		}

		if len(allowIPs) == 0 {
			c.Next()
			return
		}
		for _, ip := range strings.Split(allowIPs, ",") {
			if len(ip) == 0 {
				continue
			}
			if ip == clientIP || (strings.Contains(ip, "/") && common.CheckIpInCidr(ip, clientIP)) {
				c.Next()
				return
			}
		}
		code := security.LoadErrCode()
		helper.ErrWithHtml(c, code, "err_ip_limit")
	}
}

func isLocalSyncRequest(reqPath, clientIP, token string) bool {
	ip := net.ParseIP(clientIP)
	if ip == nil || !ip.IsLoopback() {
		return false
	}

	switch reqPath {
	case "/api/v1/core/xpack/sync/ssl":
		return token != ""
	case "/api/v1/core/settings/ssl/reload":
		return token != ""
	default:
		return false
	}
}
