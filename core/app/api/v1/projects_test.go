package v1

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/avaargsh/GPUPanel/core/app/workspace"
	"github.com/avaargsh/GPUPanel/core/constant"
	"github.com/avaargsh/GPUPanel/core/global"
	"github.com/avaargsh/GPUPanel/core/init/session/psession"
	"github.com/avaargsh/GPUPanel/core/middleware"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	goi18n "github.com/nicksnyder/go-i18n/v2/i18n"
	"golang.org/x/text/language"
	"gorm.io/gorm"
)

func projectRegistryHarness(t *testing.T) (*gin.Engine, []*http.Cookie, string, *gorm.DB) {
	t.Helper()
	oldDB, oldSession, oldI18n := global.DB, global.SESSION, global.I18n
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "core.db")), &gorm.Config{})
	if err != nil { t.Fatal(err) }
	if err := db.AutoMigrate(&workspace.Project{}, &workspace.Workspace{}); err != nil { t.Fatal(err) }
	global.DB, global.SESSION = db, psession.NewPSession("")
	// The real global CSRF guard localizes denial responses, so provide
	// a minimal non-nil localizer in this isolated HTTP harness.
	global.I18n = goi18n.NewLocalizer(goi18n.NewBundle(language.English), "en")
	t.Cleanup(func() {
		global.DB, global.SESSION, global.I18n = oldDB, oldSession, oldI18n
		d, err := db.DB()
		if err == nil { _ = d.Close() }
	})
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(middleware.CSRFTokenGuard())
	api := &BaseApi{}
	router.GET("/api/v1/core/projects", api.ListProjects)
	router.GET("/api/v1/core/projects/:id", api.GetProject)
	router.POST("/api/v1/core/projects", api.CreateProject)

	w := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(w)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/v1/core/projects", nil)
	if err := global.SESSION.Set(ctx, psession.SessionUser{
		ID: psession.SuperAdminSessionUserID, Role: "ADMIN", Name: "admin",
	}, false, 3600); err != nil { t.Fatal(err) }
	cookies := w.Result().Cookies()
	token := ""
	for _, cookie := range cookies {
		if cookie.Name == constant.CSRFTokenName { token = cookie.Value }
	}
	if token == "" { t.Fatal("real session did not issue CSRF token") }
	return router, cookies, token, db
}

func projectRequest(t *testing.T, router *gin.Engine, method string, body string, cookies []*http.Cookie, csrf string) (int, map[string]interface{}) {
	return projectRequestAt(t, router, method, "/api/v1/core/projects", body, cookies, csrf)
}

func projectRequestAt(t *testing.T, router *gin.Engine, method string, path string, body string, cookies []*http.Cookie, csrf string) (int, map[string]interface{}) {
	t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	for _, cookie := range cookies { req.AddCookie(cookie) }
	if csrf != "" { req.Header.Set(constant.CSRFHeaderName, csrf) }
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	var response map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("invalid API response %d %q: %v", w.Code, w.Body.String(), err)
	}
	return w.Code, response
}

func TestProjectRegistryHTTPRequiresRealSessionAndCSRF(t *testing.T) {
	router, cookies, csrf, db := projectRegistryHarness(t)
	if code, _ := projectRequest(t, router, http.MethodGet, "", nil, ""); code != http.StatusForbidden {
		t.Fatalf("anonymous project read must fail closed: %d", code)
	}
	if code, _ := projectRequest(t, router, http.MethodPost, `{"name":"unsafe","sourceHint":"uv"}`, cookies, ""); code != http.StatusForbidden {
		t.Fatalf("session without CSRF must not write: %d", code)
	}
	if code, _ := projectRequest(t, router, http.MethodPost, `{"name":"unsafe","sourceHint":"uv"}`, nil, csrf); code != http.StatusForbidden {
		t.Fatalf("CSRF without session must not write: %d", code)
	}
	if code, _ := projectRequest(t, router, http.MethodPost, `{"name":"my-training","sourceHint":"uv"}`, cookies, csrf); code != http.StatusOK {
		t.Fatalf("valid administrator session+CSRF rejected registration: %d", code)
	}
	var count int64
	if err := db.Model(&workspace.Project{}).Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("invalid requests affected registry: count=%d err=%v", count, err)
	}
}

func TestProjectRegistryHTTPCreateListConflictAndUnprovisionedState(t *testing.T) {
	router, cookies, csrf, _ := projectRegistryHarness(t)
	body := `{"name":"GPU research","sourceHint":"manual"}`
	code, created := projectRequest(t, router, http.MethodPost, body, cookies, csrf)
	if code != http.StatusOK { t.Fatalf("cannot create metadata: %d %#v", code, created) }
	data := created["data"].(map[string]interface{})
	if data["state"] != workspace.Registered ||
		data["workspaces"].([]interface{})[0].(map[string]interface{})["state"] != workspace.NotProvisioned {
		t.Fatalf("API incorrectly claims provisioned workspace: %#v", created)
	}
	if _, has := data["ownerId"]; has { t.Fatal("owner identity leaked into API body") }
	if code, _ := projectRequest(t, router, http.MethodPost, body, cookies, csrf); code != http.StatusConflict {
		t.Fatalf("repeated registration must return conflict: %d", code)
	}
	code, listing := projectRequest(t, router, http.MethodGet, "", cookies, "")
	if code != http.StatusOK || len(listing["data"].([]interface{})) != 1 {
		t.Fatalf("persisted project cannot be listed: %d %#v", code, listing)
	}
	if status, rejected := projectRequest(t, router, http.MethodPost,
		`{"name":"bad","sourceHint":"manual","ownerId":"forged"}`, cookies, csrf); status != http.StatusOK || rejected["code"] != float64(http.StatusBadRequest) {
		t.Fatalf("forged owner field was not rejected: status=%d response=%#v", status, rejected)
	}
}

func TestProjectRegistryHTTPRejectsLocalAndAPIKeyBypass(t *testing.T) {
	router, cookies, csrf, db := projectRegistryHarness(t)
	for _, flag := range []string{"API_AUTH", "LOCAL_REQUEST"} {
		t.Run(flag, func(t *testing.T) {
			blocked := gin.New()
			blocked.Use(func(c *gin.Context) { c.Set(flag, true); c.Next() })
			api := &BaseApi{}
			blocked.GET("/api/v1/core/projects", api.ListProjects)
			blocked.POST("/api/v1/core/projects", api.CreateProject)
			if code, _ := projectRequest(t, blocked, http.MethodGet, "", cookies, ""); code != http.StatusForbidden {
				t.Fatalf("trusted header bypassed authenticated session: %d", code)
			}
			if code, _ := projectRequest(t, blocked, http.MethodPost,
				`{"name":"unauthorized","sourceHint":"catalog"}`, cookies, csrf); code != http.StatusForbidden {
				t.Fatalf("mutating route accepted internal bypass: %d", code)
			}
		})
	}
	_ = router
	var count int64
	if err := db.Model(&workspace.Project{}).Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("bypass registered a project: %d %v", count, err)
	}
}

func TestProjectDetailHTTPNoCrossOwnerOrUnauthenticatedReads(t *testing.T) {
	router, cookies, _, db := projectRegistryHarness(t)
	a, err := workspace.New(db).Create(context.Background(), psession.SuperAdminSessionUserID, "my-study", "uv")
	if err != nil { t.Fatal(err) }
	b, err := workspace.New(db).Create(context.Background(), "another-user", "private", "manual")
	if err != nil { t.Fatal(err) }
	path := "/api/v1/core/projects/" + a.ID
	if code, _ := projectRequestAt(t, router, http.MethodGet, path, "", nil, ""); code != http.StatusForbidden {
		t.Fatalf("anonymous detail disclosure: %d", code)
	}
	code, data := projectRequestAt(t, router, http.MethodGet, path, "", cookies, "")
	if code != http.StatusOK {
		t.Fatalf("authorized detail failed: %d %#v", code, data)
	}
	item := data["data"].(map[string]interface{})
	if item["id"] != a.ID || len(item["workspaces"].([]interface{})) != 1 ||
		item["workspaces"].([]interface{})[0].(map[string]interface{})["state"] != workspace.NotProvisioned {
		t.Fatalf("false provisioned state or wrong record: %#v", data)
	}
	if _, ok := item["ownerId"]; ok { t.Fatal("owner identity leaked") }
	for _, id := range []string{b.ID, "not-a-uuid", "00000000-0000-0000-0000-000000000000"} {
		code, denied := projectRequestAt(t, router, http.MethodGet, "/api/v1/core/projects/"+id, "", cookies, "")
		if code != http.StatusNotFound || denied["message"] != "ProjectNotFound" {
			t.Fatalf("foreign/invalid must be identical not found: %d %#v", code, denied)
		}
	}
}
