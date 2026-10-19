package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/avaargsh/GPUPanel/core/utils/security"
	"github.com/gin-gonic/gin"
)

// These new React paths were linked from the frontend but absent from
// Core's allowlisted hard-refresh routes. A real installed VM found that
// /operations returned a non-React response despite successful login.
func TestNewFrontendRoutesRequireExactHTMLGETOrHEAD(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, path := range []string{"/operations", "/host", "/gpu", "/projects", "/projects/123", "/projects/a-b"} {
		t.Run(path, func(t *testing.T) {
			if !security.IsFrontendPath(path) {
				t.Fatalf("registered SPA route not recognized: %q", path)
			}
			for _, method := range []string{http.MethodGet, http.MethodHead} {
				ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
				req := httptest.NewRequest(method, path, nil)
				req.Header.Set("Accept", "text/html")
				ctx.Request = req
				if !isFrontendFallbackRequest(ctx) {
					t.Errorf("%s %s must enter authorized frontend fallback", method, path)
				}
			}
			ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
			req := httptest.NewRequest(http.MethodPost, path, nil)
			req.Header.Set("Accept", "text/html")
			ctx.Request = req
			if isFrontendFallbackRequest(ctx) {
				t.Fatal("POST cannot be served as public SPA HTML")
			}
			req = httptest.NewRequest(http.MethodGet, path, nil)
			req.Header.Set("Accept", "application/json")
			ctx.Request = req
			if isFrontendFallbackRequest(ctx) {
				t.Fatal("JSON request cannot be served as SPA HTML")
			}
		})
	}
}

func TestFrontendFallbackDoesNotAuthorizeUnknownOrTraversalLikePaths(t *testing.T) {
	for _, path := range []string{
		"/operations/approve",
		"/projects/1/secret",
		"/projects//",
		"/operations/api",
		"/admin",
		"/api/v1/hosts/operations",
		"/assets/example.js",
	} {
		if security.IsFrontendPath(path) {
			t.Errorf("unexpected SPA allowlist entry for %q", path)
		}
		ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("Accept", "text/html")
		ctx.Request = req
		if isFrontendFallbackRequest(ctx) {
			t.Errorf("fallback must deny non-SPA request: %q", path)
		}
	}
}
