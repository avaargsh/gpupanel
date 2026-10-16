package middleware

import (
	"crypto/md5"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/avaargsh/GPUPanel/core/global"
	"github.com/gin-gonic/gin"
)

const (
	// localTokenHeader is the header the local Agent sets when it calls Core
	// over loopback. It must never be honored for a non-loopback TCP peer or
	// for a forwarded (proxy-controlled) client address.
	localTokenHeader = "X-Panel-Local-Token"
	// localSecretRelPath is the fixed shared secret location, relative to the
	// configured install dir: <installDir>/gpupanel/tmp/.secret. It matches the
	// Agent side (agent/utils/req_helper/core.go uses <TmpDir>/.secret with
	// TmpDir = <installDir>/gpupanel/tmp). Core only ever reads this path.
	localSecretRelPath = "gpupanel/tmp/.secret"
	// localTokenLength is the length produced by the existing Agent protocol:
	// first 16 hex characters of md5(secret + "-" + YYYY-MM-DD).
	localTokenLength = 16
	// maxLocalSecretBytes bounds the secret file read and the accepted secret
	// length so an oversized file cannot be pulled into memory.
	maxLocalSecretBytes = 4096
)

// localSyncRoutes is the exact path/method allowlist that may ever receive the
// LOCAL_REQUEST bypass. Both routes are registered as POST only; everything
// else falls through to the ordinary session/CSRF/password authorization chain.
var localSyncRoutes = map[string]string{
	"/api/v1/core/xpack/sync/ssl":      http.MethodPost,
	"/api/v1/core/settings/ssl/reload": http.MethodPost,
}

var errLocalSecretTooLarge = errors.New("local secret exceeds the maximum accepted size")

// localSecretReader abstracts secret loading so tests inject synthetic readers
// and fixtures instead of touching any real secret.
type localSecretReader func() ([]byte, error)

type localTokenValidator struct {
	readSecret localSecretReader
	now        func() time.Time
}

func defaultLocalTokenValidator() *localTokenValidator {
	return &localTokenValidator{readSecret: readConfiguredLocalSecret, now: time.Now}
}

// readConfiguredLocalSecret resolves the one fixed configured path and reads it
// with a hard size bound. It never creates, rotates or writes the secret: a
// missing/unreadable/oversized secret fails closed and the request simply keeps
// its ordinary authorization requirements.
func readConfiguredLocalSecret() ([]byte, error) {
	installDir := strings.TrimSpace(global.CONF.Base.InstallDir)
	if installDir == "" {
		return nil, errors.New("install dir is not configured")
	}
	if !filepath.IsAbs(installDir) {
		return nil, errors.New("install dir is not absolute")
	}
	return readLocalSecretFile(filepath.Join(installDir, localSecretRelPath))
}

func readLocalSecretFile(secretPath string) ([]byte, error) {
	file, err := os.Open(secretPath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() {
		return nil, errors.New("local secret is not a regular file")
	}
	if info.Size() > maxLocalSecretBytes {
		return nil, errLocalSecretTooLarge
	}
	data, err := io.ReadAll(io.LimitReader(file, maxLocalSecretBytes+1))
	if err != nil {
		return nil, err
	}
	if len(data) > maxLocalSecretBytes {
		return nil, errLocalSecretTooLarge
	}
	return data, nil
}

// dailyLocalToken reproduces the current Agent protocol unchanged:
// hex(md5(secret + "-" + localDate))[:16].
//
// Legacy debt (removal trigger): the daily, non-replayed, MD5-based token is an
// internal single-host convenience, not a modern authentication scheme. It is
// kept only because Agent (agent/utils/req_helper/core.go) still emits it.
// Removal trigger: a coordinated Agent+Core migration to an HMAC, one-use token
// (or removal of the LOCAL_REQUEST bypass entirely); that migration is out of
// scope here and must not be done unilaterally on the Core side.
func dailyLocalToken(secret string, at time.Time) string {
	sum := md5.Sum([]byte(secret + "-" + at.Format("2006-01-02")))
	return hex.EncodeToString(sum[:])[:localTokenLength]
}

// validate reports whether token matches today's token for the shared secret.
// Any read/format/size problem fails closed (false).
func (v *localTokenValidator) validate(token string) bool {
	token = strings.TrimSpace(token)
	if token == "" || len(token) != localTokenLength {
		return false
	}
	secretBytes, err := v.readSecret()
	if err != nil {
		return false
	}
	secret := strings.TrimSpace(string(secretBytes))
	if !isSafeLocalSecret(secret) {
		return false
	}
	expected := dailyLocalToken(secret, v.now())
	return subtle.ConstantTimeCompare([]byte(expected), []byte(token)) == 1
}

// isSafeLocalSecret rejects absent, empty, oversized and unsafe (control or
// non-ASCII byte) secrets. Printable ASCII after trimming matches what the
// Agent generates (hex) while still failing closed on malformed files.
func isSafeLocalSecret(secret string) bool {
	if secret == "" || len(secret) > maxLocalSecretBytes {
		return false
	}
	for i := 0; i < len(secret); i++ {
		if secret[i] < 0x20 || secret[i] > 0x7e {
			return false
		}
	}
	return true
}

// isLoopbackPeer checks the TCP transport peer only. Forwarded headers
// (X-Forwarded-For, X-Real-IP) are attacker-controlled for untrusted peers and
// are deliberately ignored here.
func isLoopbackPeer(remoteAddr string) bool {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		host = remoteAddr
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// isLocalSyncRequest is the complete LOCAL_REQUEST decision: exact POST + exact
// path allowlist + loopback transport peer + valid daily token. Missing,
// malformed, forged, expired or unreadable-secret tokens return false so the
// request keeps ordinary authoritative auth checks.
func isLocalSyncRequest(c *gin.Context, validator *localTokenValidator) bool {
	requiredMethod, allowed := localSyncRoutes[c.Request.URL.Path]
	if !allowed || c.Request.Method != requiredMethod {
		return false
	}
	if !isLoopbackPeer(c.Request.RemoteAddr) {
		return false
	}
	return validator.validate(c.GetHeader(localTokenHeader))
}
