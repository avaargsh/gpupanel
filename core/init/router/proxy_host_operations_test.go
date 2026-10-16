package router

import (
	"fmt"
	"github.com/avaargsh/GPUPanel/core/app/model"
	"github.com/avaargsh/GPUPanel/core/app/repo"
	"github.com/avaargsh/GPUPanel/core/init/proxy"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"net/http"
	"net/http/httptest"
	"net/http/httputil"
	"net/url"
	"sync/atomic"
	"testing"

	"github.com/avaargsh/GPUPanel/core/global"
	"github.com/avaargsh/GPUPanel/core/init/session/psession"
	"github.com/gin-gonic/gin"
)

func TestHostOperationsRequireLocalAdminSession(t *testing.T) {
	old := global.SESSION
	global.SESSION = psession.NewPSession("host-operations-test")
	defer func() { global.SESSION = old }()
	admin := evidenceTestSession(t, psession.SessionUser{ID: psession.SuperAdminSessionUserID, Name: "admin", Role: "ADMIN"}, 3600)
	other := evidenceTestSession(t, psession.SessionUser{ID: "foreign", Name: "other", Role: "ADMIN"}, 3600)
	expired := evidenceTestSession(t, psession.SessionUser{ID: psession.SuperAdminSessionUserID, Name: "admin", Role: "ADMIN"}, -1)
	for _, test := range []struct {
		name, node string
		cookie     *http.Cookie
		api        bool
		want       int
	}{{"anonymous", "local", nil, false, 403}, {"admin", "local", admin, false, 204}, {"remote", "remote", admin, false, 403}, {"other", "local", other, false, 403}, {"expired", "local", expired, false, 403}, {"API key", "local", admin, true, 403}} {
		t.Run(test.name, func(t *testing.T) {
			r := gin.New()
			r.POST("/api/v1/hosts/operations/plan", func(c *gin.Context) {
				c.Set("API_AUTH", test.api)
				if authorizeHostOperations(c, test.node) {
					c.Status(204)
				}
			})
			w := httptest.NewRecorder()
			req := httptest.NewRequest("POST", "/api/v1/hosts/operations/plan", nil)
			req.Header.Set("X-Panel-User-ID", psession.SuperAdminSessionUserID)
			if test.cookie != nil {
				req.AddCookie(test.cookie)
			}
			r.ServeHTTP(w, req)
			if w.Code != test.want {
				t.Fatalf("status=%d", w.Code)
			}
		})
	}
	for _, p := range []string{"/api/v1/hosts/operations", "/api/v1/hosts/operations/id/confirm", "/api/v1/hosts/a/../operations/plan"} {
		if !isHostOperationPath(p) {
			t.Fatal("unguarded path", p)
		}
	}
	if isHostOperationPath("/api/v1/hosts/operations-other") {
		t.Fatal("unrelated path changed")
	}
}

// The production Proxy must clear browser identity headers before forwarding.
func TestHostOperationsProductionProxyRejectsSpoofAndRemote(t *testing.T) {
	oldDB, oldSession, oldProxy := global.DB, global.SESSION, proxy.LocalAgentProxy
	t.Cleanup(func() { global.DB, global.SESSION, proxy.LocalAgentProxy = oldDB, oldSession, oldProxy })
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
	global.SESSION = psession.NewPSession("hostops-real-proxy")
	admin := evidenceTestSession(t, psession.SessionUser{ID: psession.SuperAdminSessionUserID, Name: "admin", Role: "ADMIN"}, 3600)
	var count atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count.Add(1)
		if r.Header.Get("X-Panel-User-ID") != psession.SuperAdminSessionUserID || r.Header.Get("X-Panel-Auth-Session-ID") == "spoofed" || r.Header.Get("X-Panel-Auth-Session-ID") == "" {
			t.Error("untrusted identity forwarded")
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"code":200,"data":[]}`)
	}))
	defer upstream.Close()
	url, _ := url.Parse(upstream.URL)
	proxy.LocalAgentProxy = httputil.NewSingleHostReverseProxy(url)
	engine := gin.New()
	engine.Use(Proxy())
	engine.GET("/api/v1/hosts/operations", func(c *gin.Context) { c.Status(418) })
	server := httptest.NewServer(engine)
	defer server.Close()
	for _, test := range []struct {
		query  string
		cookie *http.Cookie
		want   int
	}{{"", nil, 401}, {"?operateNode=remote", admin, 403}, {"", admin, 200}} {
		req, _ := http.NewRequest("GET", server.URL+"/api/v1/hosts/operations"+test.query, nil)
		req.Header.Set("CurrentNode", "local")
		req.Header.Set("X-Panel-User-ID", "spoofed")
		req.Header.Set("X-Panel-Auth-Session-ID", "spoofed")
		if test.cookie != nil {
			req.AddCookie(test.cookie)
		}
		response, err := server.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if response.StatusCode != test.want {
			t.Fatalf("status=%d expected=%d", response.StatusCode, test.want)
		}
	}
	if count.Load() != 1 {
		t.Fatal("denied request contacted Agent")
	}
}
