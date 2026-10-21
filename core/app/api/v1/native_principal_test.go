package v1

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/avaargsh/GPUPanel/core/constant"
	"github.com/avaargsh/GPUPanel/core/middleware"
	"github.com/gin-gonic/gin"
)

func TestNativePrincipalHTTPLocalSessionAndCSRFBoundary(t *testing.T) {
	_, cookies, csrf, _ := projectRegistryHarness(t)
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(middleware.CSRFTokenGuard())
	api:=&BaseApi{}
	router.POST("/api/v1/core/native-principal/begin",api.BeginNativePrincipal)
	router.POST("/api/v1/core/native-principal/revoke",api.RevokeNativePrincipal)
	router.GET("/api/v1/core/native-principal/status",api.NativePrincipalStatus)

	request := func(method,remote,csrfValue string,withSession bool, headers map[string]string) int {
		req:=httptest.NewRequest(method,"/api/v1/core/native-principal/begin",nil)
		req.RemoteAddr=remote
		if withSession {for _,cookie:=range cookies{req.AddCookie(cookie)}}
		if csrfValue!=""{req.Header.Set(constant.CSRFHeaderName,csrfValue)}
		for k,v:=range headers{req.Header.Set(k,v)}
		w:=httptest.NewRecorder()
		router.ServeHTTP(w,req)
		return w.Code
	}
	loopback:="127.0.0.1:9234"
	for name,tc:=range map[string]struct{ remote, csrf string; session bool; headers map[string]string }{
		"anonymous":{loopback,csrf,false,nil},
		"no csrf":{loopback,"",true,nil},
		"foreign source":{"198.51.100.1:6543",csrf,true,nil},
		"forwarded":{loopback,csrf,true,map[string]string{"X-Forwarded-For":"127.0.0.1"}},
		"api-key spoof":{loopback,csrf,true,map[string]string{"1Panel-Token":"fake"}},
	} {
		t.Run(name,func(t *testing.T) {
			if code:=request(http.MethodPost,tc.remote,tc.csrf,tc.session,tc.headers);code!=http.StatusForbidden{
				t.Fatalf("bypass not rejected: %d",code)
			}
		})
	}
	// Legitimate auth+CSRF reaches the opt-in gate; no listener means 503,
	// not implicit root scan, mock proof or startup.
	if code:=request(http.MethodPost,loopback,csrf,true,nil);code!=http.StatusServiceUnavailable {
		t.Fatalf("disabled peer proof unexpectedly available: %d",code)
	}
}
