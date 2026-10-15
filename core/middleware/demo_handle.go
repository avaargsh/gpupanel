package middleware

import (
	"net/http"
	"strings"

	"github.com/avaargsh/GPUPanel/core/app/dto"
	"github.com/avaargsh/GPUPanel/core/buserr"
	"github.com/gin-gonic/gin"
)

type demoRoute struct {
	method string
	path   string
}

var demoAllowedRoutes = map[demoRoute]struct{}{
	{http.MethodPost, "/api/v1/dashboard/app/launcher/option"}: {},
	{http.MethodPost, "/api/v1/websites/config"}:               {},
	{http.MethodPost, "/api/v1/files/size"}:                    {},
	{http.MethodPost, "/api/v1/files/ai-search"}:               {},
	{http.MethodPost, "/api/v1/runtimes/sync"}:                 {},
	{http.MethodPost, "/api/v1/toolbox/device/base"}:           {},
	{http.MethodPost, "/api/v1/files/user/group"}:              {},
	{http.MethodPost, "/api/v1/files/mount"}:                   {},
	{http.MethodPost, "/api/v1/hosts/ssh/log"}:                 {},
	{http.MethodPost, "/api/v1/toolbox/clam/base"}:             {},
	{http.MethodPost, "/api/v1/backups/record/size"}:           {},

	{http.MethodPost, "/api/v1/hosts/firewall/base"}:                {},
	{http.MethodPost, "/api/v1/hosts/firewall/forward/base"}:        {},
	{http.MethodPost, "/api/v1/hosts/firewall/rules/native/detail"}: {},

	{http.MethodPost, "/api/v1/core/auth/login"}:     {},
	{http.MethodPost, "/api/v1/core/logs/login"}:     {},
	{http.MethodPost, "/api/v1/core/logs/operation"}: {},
	{http.MethodPost, "/api/v1/core/auth/logout"}:    {},

	{http.MethodPost, "/api/v1/apps/installed/loadport"}:    {},
	{http.MethodPost, "/api/v1/apps/installed/check"}:       {},
	{http.MethodPost, "/api/v1/apps/installed/conninfo"}:    {},
	{http.MethodPost, "/api/v1/databases/common/info"}:      {},
	{http.MethodPost, "/api/v1/databases/common/load/file"}: {},
	{http.MethodPost, "/api/v1/databases/variables"}:        {},
	{http.MethodPost, "/api/v1/databases/status"}:           {},

	{http.MethodPost, "/api/v1/ai/accounts/counts"}:                              {},
	{http.MethodPost, "/api/v1/ai/accounts/models"}:                              {},
	{http.MethodPost, "/api/v1/ai/agents/overview"}:                              {},
	{http.MethodPost, "/api/v1/ai/agents/hermes/chat/sessions"}:                  {},
	{http.MethodPost, "/api/v1/ai/agents/agent/list"}:                            {},
	{http.MethodPost, "/api/v1/ai/agents/agent/channels"}:                        {},
	{http.MethodPost, "/api/v1/ai/agents/agent/md/list"}:                         {},
	{http.MethodPost, "/api/v1/ai/agents/plugins/list"}:                          {},
	{http.MethodPost, "/api/v1/ai/agents/skills/list"}:                           {},
	{http.MethodPost, "/api/v1/alert/cronjob/list"}:                              {},
	{http.MethodPost, "/api/v1/xpack/cluster/replica/status"}:                    {},
	{http.MethodPost, "/api/v1/xpack/cluster/ipport/healthy"}:                    {},
	{http.MethodPost, "/api/v1/xpack/tampers/template/list"}:                     {},
	{http.MethodPost, "/api/v1/xpack/vllm/command-template/list"}:                {},
	{http.MethodPost, "/api/v1/core/enterprise/skills-hub/published"}:            {},
	{http.MethodPost, "/api/v1/core/enterprise/skills-hub/versions"}:             {},
	{http.MethodPost, "/api/v1/core/enterprise/ai-proxy/smart-route/statistics"}: {},
	{http.MethodPost, "/api/v1/core/enterprise/ai-proxy/usage/attempts"}:         {},
	{http.MethodPost, "/api/v1/core/enterprise/ai-proxy/usage/statistics"}:       {},

	{http.MethodPost, "/api/v1/xpack/waf/attack/stat"}:    {},
	{http.MethodPost, "/api/v1/xpack/waf/config/website"}: {},
	{http.MethodPost, "/api/v1/xpack/waf/relation/stat"}:  {},

	{http.MethodPost, "/api/v1/xpack/monitor/stat"}:         {},
	{http.MethodPost, "/api/v1/xpack/monitor/visitors"}:     {},
	{http.MethodPost, "/api/v1/xpack/monitor/visitors/loc"}: {},
	{http.MethodPost, "/api/v1/xpack/monitor/qps"}:          {},
	{http.MethodPost, "/api/v1/xpack/monitor/logs/stat"}:    {},
	{http.MethodPost, "/api/v1/xpack/monitor/websites"}:     {},
	{http.MethodPost, "/api/v1/xpack/monitor/trend"}:        {},
	{http.MethodPost, "/api/v1/xpack/monitor/rank"}:         {},
	{http.MethodPost, "/api/v1/xpack/waf/cdn"}:              {},

	{http.MethodPost, "/api/v1/core/nodes/list"}: {},
}

var demoDeniedRoutes = map[demoRoute]struct{}{
	{http.MethodGet, "/api/v1/containers/exec"}:           {},
	{http.MethodGet, "/api/v1/hosts/terminal/local"}:      {},
	{http.MethodGet, "/api/v1/hosts/terminal/ssh"}:        {},
	{http.MethodGet, "/api/v1/hosts/terminal/container"}:  {},
	{http.MethodGet, "/api/v1/xpack/vms/console/ws"}: {},
}

func DemoHandle() gin.HandlerFunc {
	return func(c *gin.Context) {
		if isDemoRequestAllowed(c.Request.Method, c.Request.URL.Path) {
			c.Next()
			return
		}

		c.JSON(http.StatusForbidden, dto.Response{
			Code:    http.StatusForbidden,
			Message: buserr.New("ErrDemoEnvironment").Error(),
		})
		c.Abort()
	}
}

func isDemoRequestAllowed(method, path string) bool {
	route := demoRoute{method: method, path: path}
	if _, denied := demoDeniedRoutes[route]; denied {
		return false
	}
	if method == http.MethodGet {
		return true
	}
	if method == http.MethodPost && hasPathSegment(path, "search") {
		return true
	}
	_, allowed := demoAllowedRoutes[route]
	return allowed
}

func hasPathSegment(path, segment string) bool {
	for _, item := range strings.Split(strings.Trim(path, "/"), "/") {
		if item == segment {
			return true
		}
	}
	return false
}
