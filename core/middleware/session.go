package middleware

import (
	"strconv"

	"github.com/avaargsh/GPUPanel/core/app/api/v1/helper"
	baseRepo "github.com/avaargsh/GPUPanel/core/app/repo"
	"github.com/avaargsh/GPUPanel/core/buserr"
	"github.com/avaargsh/GPUPanel/core/constant"
	"github.com/avaargsh/GPUPanel/core/global"
	psessionUtils "github.com/avaargsh/GPUPanel/core/init/session/psession"
	"github.com/gin-gonic/gin"
)

func SessionAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		apiReq := c.GetBool("API_AUTH")
		if isAnonymousAuthPath(c.Request.URL.Path) || apiReq || c.GetBool("LOCAL_REQUEST") {
			c.Next()
			return
		}

		psession, err := global.SESSION.Get(c)
		if err != nil {
			errItem := err.Error()
			if errItem == "ErrSessionDataFormat" || errItem == "ErrSessionDataNotFound" {
				helper.BadAuth(c, "ErrNotLogin", buserr.New(errItem))
				return
			}
			helper.BadAuth(c, "ErrNotLogin", err)
			return
		}
		if len(psession.Name) == 0 || len(psession.ID) == 0 {
			helper.BadAuth(c, "ErrNotLogin", err)
			return
		}
		c.Set(psessionUtils.GinContextSessionUserKey, psession)
		sessionTimeout, err := baseRepo.NewISettingRepo().GetValueByKey("SessionTimeout")
		if err != nil {
			global.LOG.Errorf("get session timeout failed, err: %v", err)
			helper.InternalServer(c, err)
			c.Abort()
			return
		}
		lifeTime, _ := strconv.Atoi(sessionTimeout)

		if _, err := global.SESSION.RefreshIfNeeded(c, psession, global.CONF.Conn.SSL == constant.StatusEnable, lifeTime); err != nil {
			errItem := err.Error()
			if errItem == "ErrSessionDataFormat" || errItem == "ErrSessionDataNotFound" {
				helper.BadAuth(c, "ErrNotLogin", buserr.New(errItem))
				return
			}
			global.LOG.Warnf("refresh session failed, path=%s, err=%v", c.Request.URL.Path, err)
			helper.BadAuth(c, "ErrNotLogin", err)
			return
		}
		c.Next()
	}
}

func isAnonymousAuthPath(path string) bool {
	switch path {
	case "/api/v1/core/auth/captcha",
		"/api/v1/core/auth/passkey/begin",
		"/api/v1/core/auth/passkey/finish",
		"/api/v1/core/auth/mfalogin",
		"/api/v1/core/auth/login",
		"/api/v1/core/auth/logout",
		"/api/v1/core/auth/setting",
		"/api/v1/core/auth/welcome":
		return true
	default:
		return false
	}
}
