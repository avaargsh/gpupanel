package middleware

import (
	"strings"

	"github.com/avaargsh/GPUPanel/core/utils/publicshare"
)

func ShouldProxyToAgent(reqPath string) bool {
	if strings.HasPrefix(reqPath, "/gpupanel/swagger") || !strings.HasPrefix(reqPath, "/api/v1") {
		return false
	}
	if strings.HasPrefix(reqPath, "/api/v1/core") && !strings.HasPrefix(reqPath, "/api/v1/core/xpack") {
		return false
	}
	return true
}

func IsPublicFileShareAPI(reqPath string) bool {
	return publicshare.IsAPI(reqPath)
}
