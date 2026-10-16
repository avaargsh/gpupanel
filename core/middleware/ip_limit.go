package middleware

import (
	"strings"

	"github.com/avaargsh/GPUPanel/core/app/api/v1/helper"
	"github.com/avaargsh/GPUPanel/core/app/repo"
	"github.com/avaargsh/GPUPanel/core/utils/common"
	"github.com/avaargsh/GPUPanel/core/utils/security"
	"github.com/gin-gonic/gin"
)

func WhiteAllow() gin.HandlerFunc {
	return whiteAllowWith(defaultLocalTokenValidator())
}

// whiteAllowWith exists so tests inject a synthetic token validator; production
// callers use WhiteAllow, which reads the fixed shared secret path lazily.
func whiteAllowWith(validator *localTokenValidator) gin.HandlerFunc {
	return func(c *gin.Context) {
		if isLocalSyncRequest(c, validator) {
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
