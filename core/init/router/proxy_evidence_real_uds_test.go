package router

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
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

// This test sends real HTTP through Core's production Proxy() and production
// Unix-socket ReverseProxy implementation into the production Agent AppRouter.
// The Agent process and Docker are disposable CI fixtures, not installed hosts.
func realUDSEvidenceSessionCookie(t *testing.T, user psession.SessionUser, ttl int) *http.Cookie {
	t.Helper()
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v2/apps/installed/evidence/1", nil)
	if err := global.SESSION.SetFresh(c, user, false, ttl); err != nil { t.Fatal(err) }
	for _, cookie := range w.Result().Cookies() {
		if cookie.HttpOnly { return cookie }
	}
	t.Fatal("no authenticated session cookie was minted")
	return nil
}

func TestCoreEvidenceRealUnixAgentAndDocker(t *testing.T) {
	socket := os.Getenv("GPUPANEL_E2E_SOCKET")
	phase := os.Getenv("GPUPANEL_EVIDENCE_PHASE")
	if socket == "" {
		t.Skip("requires isolated CI Agent Unix socket")
	}
	if !filepath.IsAbs(socket) || filepath.Base(socket) != "agent.sock" {
		t.Fatal("invalid test-only socket path")
	}
	if phase != "running" && phase != "exited" {
		t.Fatal("invalid test phase")
	}
	originalDB, originalSession, originalProxy := global.DB, global.SESSION, proxy.LocalAgentProxy
	t.Cleanup(func() {
		global.DB, global.SESSION, proxy.LocalAgentProxy = originalDB, originalSession, originalProxy
	})
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "core.sqlite")), &gorm.Config{})
	if err != nil { t.Fatal(err) }
	if err := db.AutoMigrate(&model.Setting{}); err != nil { t.Fatal(err) }
	global.DB = db
	if err := repo.NewISettingRepo().UpdateOrCreate("SessionTimeout", "3600"); err != nil { t.Fatal(err) }
	global.SESSION = psession.NewPSession("real-unix-evidence")
	admin := realUDSEvidenceSessionCookie(t, psession.SessionUser{
		ID: psession.SuperAdminSessionUserID, Name: "admin", Role: "ADMIN",
	}, 3600)
	other := realUDSEvidenceSessionCookie(t, psession.SessionUser{
		ID: "not-superadmin", Name: "other", Role: "ADMIN",
	}, 3600)
	proxy.LocalAgentProxy = proxy.NewLocalAgentProxyForSocket(socket)
	engine := gin.New()
	engine.Use(func(c *gin.Context) {
		// Simulates an already-validated API credential context, which must
		// still be disallowed for this privileged personal-workstation route.
		if c.GetHeader("X-CI-Valid-API-Key") == "1" {
			c.Set("API_AUTH", true)
		}
		c.Next()
	})
	engine.Use(Proxy())
	engine.GET("/api/v2/apps/installed/evidence/:appInstallId", func(c *gin.Context) {
		c.Status(http.StatusTeapot)
	})
	server := httptest.NewServer(engine)
	defer server.Close()
	tests := []struct {
		name, node, query string
		cookie *http.Cookie
		apiKey bool
		want int
	}{
		{name: "anonymous header spoof denied", node: "local", want: http.StatusUnauthorized},
		{name: "other identity denied", cookie: other, node: "local", want: http.StatusForbidden},
		{name: "API key denied", cookie: admin, apiKey: true, node: "local", want: http.StatusForbidden},
		{name: "foreign host denied", cookie: admin, node: "another-node", want: http.StatusForbidden},
		{name: "query foreign host denied", cookie: admin, node: "local", query: "?operateNode=another-node", want: http.StatusForbidden},
		{name: "local admin observes actual Docker", cookie: admin, node: "local", want: http.StatusOK},
		{name: "default local node observes actual Docker", cookie: admin, want: http.StatusOK},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req, err := http.NewRequest(http.MethodGet, server.URL+"/api/v2/apps/installed/evidence/1"+tc.query, nil)
			if err != nil { t.Fatal(err) }
			req.Header.Set("CurrentNode", tc.node)
			req.Header.Set("X-Panel-User", "admin")
			if tc.cookie != nil { req.AddCookie(tc.cookie) }
			if tc.apiKey { req.Header.Set("X-CI-Valid-API-Key", "1") }
			resp, err := http.DefaultClient.Do(req)
			if err != nil { t.Fatal(err) }
			body, err := io.ReadAll(io.LimitReader(resp.Body, 512*1024))
			_ = resp.Body.Close()
			if err != nil { t.Fatal(err) }
			if resp.StatusCode != tc.want {
				t.Fatalf("HTTP %d, expected %d: %q", resp.StatusCode, tc.want, string(body))
			}
			if resp.StatusCode != http.StatusOK {
				if strings.Contains(string(body), "classification") || strings.Contains(string(body), "containers") {
					t.Fatalf("denied request leaked Agent diagnostic: %q", string(body))
				}
				return
			}
			var out struct {
				Code int `json:"code"`
				Data struct {
					Classification string `json:"classification"`
					Verified bool `json:"verified"`
					TaskID string `json:"taskId"`
					Containers []struct {
						Name string `json:"name"`
						State string `json:"state"`
					} `json:"containers"`
				} `json:"data"`
			}
			if err := json.Unmarshal(body, &out); err != nil { t.Fatal(err) }
			expected := "CONSISTENT"
			if phase == "exited" { expected = "PARTIAL" }
			if out.Code != 200 || out.Data.Classification != expected ||
				out.Data.Verified || len(out.Data.Containers) != 1 ||
				out.Data.Containers[0].State != phase || out.Data.TaskID == "" ||
				strings.Contains(string(body), "DO_NOT_RETURN_CI_SECRET") ||
				strings.Contains(string(body), "dockerCompose") {
				t.Fatalf("Core to real Agent to Docker diagnostic unexpected: %s", body)
			}
		})
	}
}
