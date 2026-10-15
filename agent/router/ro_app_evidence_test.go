package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/avaargsh/GPUPanel/agent/global"
	"github.com/gin-gonic/gin"
)

func TestAppEvidenceLocalMasterOnly(t *testing.T) {
	prior := global.IsMaster
	t.Cleanup(func() { global.IsMaster = prior })
	for _, tc := range []struct {
		name     string
		master   bool
		expected int
	}{
		{name: "node certificate cannot authorize user evidence", master: false, expected: http.StatusForbidden},
		{name: "master Unix-socket route can continue to Core identity gate", master: true, expected: http.StatusNoContent},
	} {
		t.Run(tc.name, func(t *testing.T) {
			global.IsMaster = tc.master
			engine := gin.New()
			engine.GET("/api/v1/apps/installed/evidence/:appInstallId",
				localMasterAppEvidenceOnly,
				func(c *gin.Context) { c.Status(http.StatusNoContent) })
			w := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, "/api/v1/apps/installed/evidence/1", nil)
			// Host-identifying headers cannot elevate a nonmaster node Agent.
			req.Header.Set("X-Panel-User", "admin")
			req.Header.Set("CurrentNode", "local")
			engine.ServeHTTP(w, req)
			if w.Code != tc.expected {
				t.Fatalf("unexpected evidence status: got %d, want %d", w.Code, tc.expected)
			}
			if !tc.master && w.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("a rejected Agent evidence response must not be cached")
			}
		})
	}
}
