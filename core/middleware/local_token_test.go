package middleware

import (
	"crypto/md5"
	"encoding/hex"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/avaargsh/GPUPanel/core/app/model"
	"github.com/avaargsh/GPUPanel/core/app/repo"
	"github.com/avaargsh/GPUPanel/core/global"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// The fixtures below are synthetic. No real .secret file is read or created in
// the repository; readers are injected and file fixtures live in t.TempDir().

const fixtureSecret = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

func fixtureToken(secret string, at time.Time) string {
	sum := md5.Sum([]byte(secret + "-" + at.Format("2006-01-02")))
	return hex.EncodeToString(sum[:])[:localTokenLength]
}

func fixedClock(at time.Time) func() time.Time {
	return func() time.Time { return at }
}

func newFixtureValidator(secret string, at time.Time, err error) *localTokenValidator {
	return &localTokenValidator{
		readSecret: func() ([]byte, error) {
			if err != nil {
				return nil, err
			}
			return []byte(secret), nil
		},
		now: fixedClock(at),
	}
}

func TestLocalTokenValidatorAcceptsCurrentProtocolToken(t *testing.T) {
	now := time.Date(2026, time.October, 17, 12, 0, 0, 0, time.UTC)
	validator := newFixtureValidator(fixtureSecret, now, nil)
	token := fixtureToken(fixtureSecret, now)

	if !validator.validate(token) {
		t.Fatalf("current protocol token rejected; token=%q secret fixture present", token)
	}
	// Protocol reproduction check: hex(md5(secret + "-" + date))[:16].
	sum := md5.Sum([]byte(fixtureSecret + "-2026-10-17"))
	if want := hex.EncodeToString(sum[:])[:localTokenLength]; want != token {
		t.Fatalf("fixture token drifted from agent protocol: got %q want %q", token, want)
	}
}

func TestLocalTokenValidatorDeniesInvalidTokens(t *testing.T) {
	now := time.Date(2026, time.October, 17, 12, 0, 0, 0, time.UTC)
	valid := fixtureToken(fixtureSecret, now)
	expired := fixtureToken(fixtureSecret, now.Add(-24*time.Hour))
	cases := []struct {
		name  string
		token string
	}{
		{name: "empty", token: ""},
		{name: "whitespace only", token: "   "},
		{name: "random forged value", token: "deadbeefdeadbeef"},
		{name: "expired previous-day token", token: expired},
		{name: "truncated token", token: valid[:15]},
		{name: "longer than protocol length", token: valid + "aa"},
		{name: "valid token with trailing junk", token: valid + "x"},
		{name: "uppercase variant of valid token", token: strings.ToUpper(valid)},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			validator := newFixtureValidator(fixtureSecret, now, nil)
			if validator.validate(tt.token) {
				t.Fatalf("token %q must not validate", tt.token)
			}
		})
	}
}

func TestLocalTokenValidatorDeniesSecretProblems(t *testing.T) {
	now := time.Date(2026, time.October, 17, 12, 0, 0, 0, time.UTC)
	token := fixtureToken(fixtureSecret, now)
	oversized := strings.Repeat("a", maxLocalSecretBytes+1)
	cases := []struct {
		name   string
		secret string
		err    error
	}{
		{name: "missing secret file", err: os.ErrNotExist},
		{name: "unreadable secret", err: os.ErrPermission},
		{name: "secret read failure", err: errors.New("io failure")},
		{name: "empty secret", secret: ""},
		{name: "blank secret", secret: "   \n"},
		{name: "oversized secret", secret: oversized},
		{name: "unsafe control bytes in secret", secret: "abc\x00def"},
		{name: "newline inside secret", secret: "abc\ndef"},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			validator := newFixtureValidator(tt.secret, now, tt.err)
			if validator.validate(token) {
				t.Fatalf("token must fail closed when the secret is %s", tt.name)
			}
		})
	}
}

func TestReadLocalSecretFileRejectsUnsafeAndOversized(t *testing.T) {
	dir := t.TempDir()
	secretPath := filepath.Join(dir, ".secret")

	if err := os.WriteFile(secretPath, []byte(fixtureSecret), 0o600); err != nil {
		t.Fatal(err)
	}
	data, err := readLocalSecretFile(secretPath)
	if err != nil || strings.TrimSpace(string(data)) != fixtureSecret {
		t.Fatalf("readable secret should load, got %q err=%v", data, err)
	}

	if err := os.WriteFile(secretPath, []byte(strings.Repeat("a", maxLocalSecretBytes+1)), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := readLocalSecretFile(secretPath); !errors.Is(err, errLocalSecretTooLarge) {
		t.Fatalf("oversized secret file must be rejected, got err=%v", err)
	}

	if err := os.WriteFile(secretPath, []byte(fixtureSecret), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(secretPath, 0o000); err != nil {
		t.Skipf("cannot drop fixture permissions: %v", err)
	}
	t.Cleanup(func() { _ = os.Chmod(secretPath, 0o600) })
	if _, err := readLocalSecretFile(secretPath); err == nil {
		t.Fatal("unreadable secret must fail closed")
	}
	if _, err := readLocalSecretFile(filepath.Join(dir, "absent")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("absent secret must fail closed, got err=%v", err)
	}
}

func TestReadConfiguredLocalSecretFailsClosedWithoutUnsafePath(t *testing.T) {
	original := globalInstallDirForTest(t, "")
	if _, err := readConfiguredLocalSecret(); err == nil {
		t.Fatal("empty install dir must not resolve a secret path")
	}
	_ = original
	globalInstallDirForTest(t, "relative/path")
	if _, err := readConfiguredLocalSecret(); err == nil {
		t.Fatal("relative install dir must not resolve a secret path")
	}
}

// globalInstallDirForTest swaps global.CONF.Base.InstallDir and restores it.
// It only touches process-local configuration, never any secret file.
func globalInstallDirForTest(t *testing.T, value string) string {
	t.Helper()
	old := global.CONF.Base.InstallDir
	global.CONF.Base.InstallDir = value
	t.Cleanup(func() { global.CONF.Base.InstallDir = old })
	return old
}

func newSyncRequest(t *testing.T, method, path, remoteAddr string, headers map[string]string) *gin.Context {
	t.Helper()
	gin.SetMode(gin.TestMode)
	req := httptest.NewRequest(method, path, nil)
	if remoteAddr != "" {
		req.RemoteAddr = remoteAddr
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = req
	return c
}

func TestIsLocalSyncRequestAdmitsOnlyExactLocalRequest(t *testing.T) {
	now := time.Date(2026, time.October, 17, 12, 0, 0, 0, time.UTC)
	valid := fixtureToken(fixtureSecret, now)
	validator := newFixtureValidator(fixtureSecret, now, nil)

	cases := []struct {
		name       string
		method     string
		path       string
		remoteAddr string
		headers    map[string]string
		want       bool
	}{
		{name: "valid current token on ssl reload", method: http.MethodPost, path: "/api/v1/core/settings/ssl/reload", remoteAddr: "127.0.0.1:45678", headers: map[string]string{localTokenHeader: valid}, want: true},
		{name: "valid current token on xpack sync ssl", method: http.MethodPost, path: "/api/v1/core/xpack/sync/ssl", remoteAddr: "[::1]:45678", headers: map[string]string{localTokenHeader: valid}, want: true},
		{name: "missing token keeps ordinary auth", method: http.MethodPost, path: "/api/v1/core/settings/ssl/reload", remoteAddr: "127.0.0.1:45678", want: false},
		{name: "forged token denied", method: http.MethodPost, path: "/api/v1/core/settings/ssl/reload", remoteAddr: "127.0.0.1:45678", headers: map[string]string{localTokenHeader: "0000000000000000"}, want: false},
		{name: "expired token denied", method: http.MethodPost, path: "/api/v1/core/settings/ssl/reload", remoteAddr: "127.0.0.1:45678", headers: map[string]string{localTokenHeader: fixtureToken(fixtureSecret, now.Add(-24*time.Hour))}, want: false},
		{name: "non loopback peer denied", method: http.MethodPost, path: "/api/v1/core/settings/ssl/reload", remoteAddr: "192.0.2.10:45678", headers: map[string]string{localTokenHeader: valid}, want: false},
		{name: "spoofed forwarding headers denied", method: http.MethodPost, path: "/api/v1/core/settings/ssl/reload", remoteAddr: "192.0.2.10:45678", headers: map[string]string{localTokenHeader: valid, "X-Forwarded-For": "127.0.0.1", "X-Real-IP": "127.0.0.1"}, want: false},
		{name: "unsupported path denied", method: http.MethodPost, path: "/api/v1/core/settings/search", remoteAddr: "127.0.0.1:45678", headers: map[string]string{localTokenHeader: valid}, want: false},
		{name: "unsupported method denied", method: http.MethodGet, path: "/api/v1/core/settings/ssl/reload", remoteAddr: "127.0.0.1:45678", headers: map[string]string{localTokenHeader: valid}, want: false},
		{name: "unsupported method on sync path denied", method: http.MethodDelete, path: "/api/v1/core/xpack/sync/ssl", remoteAddr: "127.0.0.1:45678", headers: map[string]string{localTokenHeader: valid}, want: false},
		{name: "invalid peer address denied", method: http.MethodPost, path: "/api/v1/core/settings/ssl/reload", remoteAddr: "not-an-ip", headers: map[string]string{localTokenHeader: valid}, want: false},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			c := newSyncRequest(t, tt.method, tt.path, tt.remoteAddr, tt.headers)
			if got := isLocalSyncRequest(c, validator); got != tt.want {
				t.Fatalf("isLocalSyncRequest=%t, want %t", got, tt.want)
			}
		})
	}
}

// TestWhiteAllowLocalTokenBypass verifies the middleware wiring: only a valid
// local request sets LOCAL_REQUEST; a missing token leaves it unset so the
// ordinary authoritative authorization chain still applies.
func TestWhiteAllowLocalTokenBypass(t *testing.T) {
	now := time.Date(2026, time.October, 17, 12, 0, 0, 0, time.UTC)
	validator := newFixtureValidator(fixtureSecret, now, nil)
	valid := fixtureToken(fixtureSecret, now)

	originalDB := global.DB
	t.Cleanup(func() { global.DB = originalDB })
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.Setting{}); err != nil {
		t.Fatal(err)
	}
	global.DB = db
	settingRepo := repo.NewISettingRepo()
	for key, value := range map[string]string{"AllowIPTrustedProxies": "", "AllowIPs": ""} {
		if err := settingRepo.UpdateOrCreate(key, value); err != nil {
			t.Fatal(err)
		}
	}

	cases := []struct {
		name    string
		headers map[string]string
		want    bool
	}{
		{name: "valid token grants local request", headers: map[string]string{localTokenHeader: valid}, want: true},
		{name: "missing token never grants local request", headers: nil, want: false},
		{name: "forged token never grants local request", headers: map[string]string{localTokenHeader: "abcdefabcdefabcd"}, want: false},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			gin.SetMode(gin.TestMode)
			router := gin.New()
			router.Use(whiteAllowWith(validator))
			var localRequest bool
			router.POST("/api/v1/core/settings/ssl/reload", func(c *gin.Context) {
				localRequest = c.GetBool("LOCAL_REQUEST")
				c.Status(http.StatusNoContent)
			})
			req := httptest.NewRequest(http.MethodPost, "/api/v1/core/settings/ssl/reload", nil)
			req.RemoteAddr = "127.0.0.1:45678"
			for k, v := range tt.headers {
				req.Header.Set(k, v)
			}
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)
			if localRequest != tt.want {
				t.Fatalf("LOCAL_REQUEST=%t, want %t (status=%d)", localRequest, tt.want, rec.Code)
			}
		})
	}
}
