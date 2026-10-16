package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

// The Core browser boundary must reject cross-origin upgrades before proxying
// to the privileged local Agent socket. These checks intentionally do not
// claim that the Agent's own upgrader authenticates browser Origin.
func TestWebSocketOriginGuardLocalTerminal(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cases := []struct {
		name      string
		origin    []string
		fetchSite string
		want      int
	}{
		{name: "same origin", origin: []string{"http://panel.test"}, fetchSite: "same-origin", want: http.StatusNoContent},
		{name: "same origin without fetch metadata", origin: []string{"http://panel.test"}, want: http.StatusNoContent},
		{name: "non-browser client without origin", want: http.StatusNoContent},
		{name: "cross origin", origin: []string{"http://evil.test"}, want: http.StatusForbidden},
		{name: "same origin but cross-site fetch metadata", origin: []string{"http://panel.test"}, fetchSite: "cross-site", want: http.StatusForbidden},
		{name: "same-site is not same-origin", origin: []string{"http://panel.test"}, fetchSite: "same-site", want: http.StatusForbidden},
		{name: "multiple origin headers", origin: []string{"http://panel.test", "http://evil.test"}, want: http.StatusForbidden},
		{name: "wrong port", origin: []string{"http://panel.test:9999"}, want: http.StatusForbidden},
		{name: "origin with credentials", origin: []string{"http://user@panel.test"}, want: http.StatusForbidden},
		{name: "origin with path", origin: []string{"http://panel.test/other"}, want: http.StatusForbidden},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			router := gin.New()
			reached := false
			router.Use(WebSocketOriginGuard())
			router.GET("/api/v1/hosts/terminal/local", func(c *gin.Context) {
				reached = true
				c.Status(http.StatusNoContent)
			})
			req := httptest.NewRequest(http.MethodGet, "http://panel.test/api/v1/hosts/terminal/local", nil)
			req.Header.Set("Connection", "Upgrade")
			req.Header.Set("Upgrade", "websocket")
			req.Header.Set("Sec-WebSocket-Version", "13")
			for _, origin := range tt.origin {
				req.Header.Add("Origin", origin)
			}
			if tt.fetchSite != "" {
				req.Header.Set("Sec-Fetch-Site", tt.fetchSite)
			}
			rr := httptest.NewRecorder()
			router.ServeHTTP(rr, req)
			if rr.Code != tt.want {
				t.Fatalf("upgrade guard status = %d, want %d", rr.Code, tt.want)
			}
			if reached != (tt.want == http.StatusNoContent) {
				t.Fatalf("proxy boundary reached=%t, expected only for admitted origin", reached)
			}
		})
	}
}
