package router

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/http/httputil"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/1Panel-dev/1Panel/core/app/model"
	"github.com/1Panel-dev/1Panel/core/app/repo"
	"github.com/1Panel-dev/1Panel/core/global"
	"github.com/1Panel-dev/1Panel/core/init/proxy"
	"github.com/1Panel-dev/1Panel/core/init/session/psession"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// TestCoreAppEvidenceProxyHTTPGate runs the actual Core Proxy middleware and
// in-process reverse proxy. The fake upstream records whether an Agent would
// be contacted. It never starts an Agent or Docker daemon.
func TestCoreAppEvidenceProxyHTTPGate(t *testing.T) {
	originalDB, originalSession, originalProxy := global.DB, global.SESSION, proxy.LocalAgentProxy
	t.Cleanup(func() {
		global.DB, global.SESSION, proxy.LocalAgentProxy = originalDB, originalSession, originalProxy
	})
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.Setting{}); err != nil {
		t.Fatal(err)
	}
	global.DB = db
	if err := repo.NewISettingRepo().UpdateOrCreate("SessionTimeout", "3600"); err != nil {
		t.Fatal(err)
	}
	global.SESSION = psession.NewPSession("evidence-proxy-test")
	admin := evidenceTestSession(t, psession.SessionUser{
		ID: psession.SuperAdminSessionUserID, Name: "admin", Role: "ADMIN",
	}, 3600)
	other := evidenceTestSession(t, psession.SessionUser{
		ID: "another-user", Name: "another-user", Role: "ADMIN",
	}, 3600)

	var reached atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		reached.Add(1)
		if req.URL.Path != "/api/v2/apps/installed/evidence/10" {
			t.Errorf("unexpected Agent request path: %s", req.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"code":200,"data":{"classification":"UNKNOWN","verified":false}}`)
	}))
	defer upstream.Close()
	parsed, err := url.Parse(upstream.URL)
	if err != nil {
		t.Fatal(err)
	}
	proxy.LocalAgentProxy = httputil.NewSingleHostReverseProxy(parsed)

	engine := gin.New()
	// Mimic an earlier API middleware that has *already verified* an API key:
	// the actual protected evidence endpoint must reject even such callers.
	engine.Use(func(c *gin.Context) {
		if c.GetHeader("X-Test-Verified-API-Key") == "1" {
			c.Set("API_AUTH", true)
		}
		c.Next()
	})
	engine.Use(Proxy())
	engine.GET("/api/v2/apps/installed/evidence/:appInstallId", func(c *gin.Context) {
		c.Status(http.StatusTeapot) // Reaching Gin fallback is never success.
	})
	// A real HTTP server supplies ReverseProxy's CloseNotifier/flush contract;
	// ResponseRecorder is insufficient for Gin's writer implementation.
	coreServer := httptest.NewServer(engine)
	defer coreServer.Close()

	tests := []struct {
		name, query, node string
		cookie           *http.Cookie
		apiKey           bool
		expected         int
		forwarded        bool
	}{
		{name: "anonymous spoofed header", node: "local", expected: http.StatusUnauthorized},
		{name: "real admin cookie forwards local", cookie: admin, node: "local", expected: http.StatusOK, forwarded: true},
		{name: "default empty node forwards local", cookie: admin, expected: http.StatusOK, forwarded: true},
		{name: "nonadmin user cookie denied", cookie: other, node: "local", expected: http.StatusForbidden},
		{name: "remote node denied", cookie: admin, node: "other-host", expected: http.StatusForbidden},
		{name: "query chooses remote regardless of local header", cookie: admin, node: "local", query: "?operateNode=other-host", expected: http.StatusForbidden},
		{name: "verified API key still denied", cookie: admin, node: "local", apiKey: true, expected: http.StatusForbidden},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			before := reached.Load()
			req, err := http.NewRequest(http.MethodGet, coreServer.URL+"/api/v2/apps/installed/evidence/10"+tt.query, nil)
			if err != nil {
				t.Fatal(err)
			}
			req.Header.Set("CurrentNode", tt.node)
			req.Header.Set("X-Panel-User", "admin")
			if tt.cookie != nil {
				req.AddCookie(tt.cookie)
			}
			if tt.apiKey {
				req.Header.Set("X-Test-Verified-API-Key", "1")
			}
			res, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			body, err := io.ReadAll(res.Body)
			_ = res.Body.Close()
			if err != nil {
				t.Fatal(err)
			}
			if res.StatusCode != tt.expected {
				t.Fatalf("got HTTP %d, want %d, body=%q", res.StatusCode, tt.expected, string(body))
			}
			delta := reached.Load() - before
			if tt.forwarded && delta != 1 {
				t.Fatalf("allowed evidence request not forwarded exactly once: %d", delta)
			}
			if !tt.forwarded && delta != 0 {
				t.Fatalf("denied request leaked to Agent %d times", delta)
			}
			if tt.forwarded && !strings.Contains(string(body), `"verified":false`) {
				t.Fatalf("unexpected upstream diagnostic body: %q", string(body))
			}
		})
	}
}
