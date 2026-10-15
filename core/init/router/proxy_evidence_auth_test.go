package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/avaargsh/GPUPanel/core/global"
	"github.com/avaargsh/GPUPanel/core/init/session/psession"
	"github.com/gin-gonic/gin"
)

// The Core guard is exercised with actual signed-in in-memory session cookies.
// No Docker daemon or privileged Unix socket is required to test authorization.
func evidenceTestSession(t *testing.T, user psession.SessionUser, ttlSeconds int) *http.Cookie {
	t.Helper()
	w := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(w)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/v1/apps/installed/evidence/1", nil)
	if err := global.SESSION.SetFresh(ctx, user, false, ttlSeconds); err != nil {
		t.Fatal(err)
	}
	for _, cookie := range w.Result().Cookies() {
		if cookie.HttpOnly {
			return cookie
		}
	}
	t.Fatal("no session cookie generated")
	return nil
}

func TestCoreAppEvidenceAuthorization(t *testing.T) {
	oldSession := global.SESSION
	global.SESSION = psession.NewPSession("test-app-evidence")
	t.Cleanup(func() { global.SESSION = oldSession })

	admin := evidenceTestSession(t, psession.SessionUser{
		ID: psession.SuperAdminSessionUserID, Name: "admin", Role: "ADMIN",
	}, 3600)
	nonAdmin := evidenceTestSession(t, psession.SessionUser{
		ID: "untrusted-user", Name: "someone", Role: "ADMIN",
	}, 3600)
	wrongRole := evidenceTestSession(t, psession.SessionUser{
		ID: psession.SuperAdminSessionUserID, Name: "admin", Role: "USER",
	}, 3600)
	expired := evidenceTestSession(t, psession.SessionUser{
		ID: psession.SuperAdminSessionUserID, Name: "admin", Role: "ADMIN",
	}, -1)

	tests := []struct {
		name      string
		cookie    *http.Cookie
		node      string
		apiKey    bool
		spoofUser bool
		path      string
		want      int
	}{
		{name: "anonymous local", node: "local", want: http.StatusForbidden},
		{name: "forged user header", node: "local", spoofUser: true, want: http.StatusForbidden},
		{name: "real admin local", cookie: admin, node: "local", want: http.StatusNoContent},
		{name: "real admin default local", cookie: admin, node: "", want: http.StatusNoContent},
		{name: "real admin remote node", cookie: admin, node: "other-host", want: http.StatusForbidden},
		{name: "api key cannot proxy evidence even with cookie", cookie: admin, node: "local", apiKey: true, want: http.StatusForbidden},
		{name: "non-admin user id", cookie: nonAdmin, node: "local", want: http.StatusForbidden},
		{name: "incorrect role", cookie: wrongRole, node: "local", want: http.StatusForbidden},
		{name: "expired session", cookie: expired, node: "local", want: http.StatusForbidden},
		{name: "unrelated app endpoint untouched", path: "/api/v1/apps/installed/list", node: "remote", want: http.StatusNoContent},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := tt.path
			if path == "" {
				path = "/api/v1/apps/installed/evidence/1"
			}
			r := gin.New()
			r.GET(path, func(c *gin.Context) {
				if tt.apiKey {
					c.Set("API_AUTH", true)
				}
				if !authorizeLocalAppEvidence(c, tt.node) {
					return
				}
				c.Status(http.StatusNoContent)
			})
			w := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, path, nil)
			if tt.cookie != nil {
				req.AddCookie(tt.cookie)
			}
			if tt.spoofUser {
				req.Header.Set("X-Panel-User", "admin")
			}
			r.ServeHTTP(w, req)
			if w.Code != tt.want {
				t.Fatalf("status %d, want %d", w.Code, tt.want)
			}
			if isAppEvidencePath(path) && w.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("evidence response must not be cached, even on denial")
			}
		})
	}
}

func TestCoreAppEvidencePathNormalization(t *testing.T) {
	for _, path := range []string{
		"/api/v1/apps/installed/evidence/1",
		"/api/v1/apps/installed/evidence/123",
		"/api/v1/apps/installed/evidence/1/",
	} {
		if !isAppEvidencePath(path) {
			t.Fatalf("evidence route missing guard: %s", path)
		}
	}
	for _, path := range []string{
		"/api/v1/apps/installed/list",
		"/api/v1/apps/installed/info/1",
		"/api/v1/apps/installed/evidence-mock/1",
		"/api/v1/core/apps/installed/evidence/1",
	} {
		if isAppEvidencePath(path) {
			t.Fatalf("unexpected app route blocked: %s", path)
		}
	}
}
