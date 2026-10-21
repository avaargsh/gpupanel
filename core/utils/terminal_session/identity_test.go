package terminal_session

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestClearForwardedHeadersRemovesClientSuppliedIdentity(t *testing.T) {
	gin.SetMode(gin.TestMode)
	req := httptest.NewRequest("GET", "/api/v1/hosts/terminal/local", nil)
	req.Header.Set(HeaderUserID, "forged-user")
	req.Header.Set(HeaderAuthSessionID, "forged-session")
	req.Header.Set(HeaderAuthLeaseUntil, "9999999999999")

	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = req
	ClearForwardedHeaders(ctx)

	for _, name := range []string{HeaderUserID, HeaderAuthSessionID, HeaderAuthLeaseUntil} {
		if got := req.Header.Get(name); got != "" {
			t.Errorf("ClearForwardedHeaders left %s=%q", name, got)
		}
	}
}

func TestSetForwardedHeadersClearsStaleLease(t *testing.T) {
	gin.SetMode(gin.TestMode)
	req := httptest.NewRequest("GET", "/api/v1/hosts/terminal/local", nil)
	req.Header.Set(HeaderAuthLeaseUntil, "9999999999999")
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = req

	SetForwardedHeaders(ctx, Identity{UserID: "user-1", AuthSessionID: "session-1"})

	if got := req.Header.Get(HeaderUserID); got != "user-1" {
		t.Fatalf("user header=%q, want user-1", got)
	}
	if got := req.Header.Get(HeaderAuthSessionID); got != "session-1" {
		t.Fatalf("session header=%q, want session-1", got)
	}
	if got := req.Header.Get(HeaderAuthLeaseUntil); got != "" {
		t.Fatalf("stale lease header must be removed, got %q", got)
	}
}

func TestSetForwardedHeadersFormatsLeaseInUnixMilliseconds(t *testing.T) {
	gin.SetMode(gin.TestMode)
	req := httptest.NewRequest("GET", "/api/v1/hosts/terminal/local", nil)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = req
	lease := time.UnixMilli(1_800_000_000_123)

	SetForwardedHeaders(ctx, Identity{
		UserID:         "user-1",
		AuthSessionID:  "session-1",
		AuthLeaseUntil: lease,
	})

	if got, want := req.Header.Get(HeaderAuthLeaseUntil), "1800000000123"; got != want {
		t.Fatalf("lease header=%q, want %q", got, want)
	}
}

func TestFromContextDoesNotTrustForwardedHeadersAlone(t *testing.T) {
	gin.SetMode(gin.TestMode)
	req := httptest.NewRequest("GET", "/api/v1/hosts/terminal/local", nil)
	req.Header.Set(HeaderUserID, "forged-user")
	req.Header.Set(HeaderAuthSessionID, "forged-session")
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = req

	if identity, ok := FromContext(ctx); ok {
		t.Fatalf("forwarded headers alone must not create identity: %+v", identity)
	}
	if identity, ok := FromContext(nil); ok {
		t.Fatalf("nil context must not create identity: %+v", identity)
	}
}

func TestHashAuthSessionIDIsDeterministicAndDoesNotExposeInput(t *testing.T) {
	raw := "sensitive-session-cookie"
	first := HashAuthSessionID(raw)
	second := HashAuthSessionID(raw)

	if first != second {
		t.Fatal("session ID hash must be deterministic")
	}
	if first == raw {
		t.Fatal("session ID hash must not return the raw session cookie")
	}
	if len(first) != 64 {
		t.Fatalf("SHA-256 hex digest length=%d, want 64", len(first))
	}
}
