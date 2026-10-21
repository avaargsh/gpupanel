// Package security contains fail-closed primitives for a future local-only,
// read-only session projection. It is not wired to HTTP routes.
package security

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
)

const ReadSessionScope = "session:read"

var (
	ErrInvalidGrant = errors.New("invalid session grant")
	ErrReplay       = errors.New("session grant replayed")
)

// SessionGrant is the exact, versioned claim set authenticated by Signature.
// Keep field order stable: the verifier signs/verifies encoding of these claims.
type SessionGrant struct {
	Version   int    `json:"version"`
	Issuer    string `json:"iss"`
	Audience  string `json:"aud"`
	Principal string `json:"sub"`
	UID       uint32 `json:"uid"`
	Scope     string `json:"scope"`
	SessionID string `json:"sid"`
	IssuedAt  int64  `json:"iat"`
	ExpiresAt int64  `json:"exp"`
	JTI       string `json:"jti"`
	Signature string `json:"sig"`
}

// SessionOwner is runtime-derived evidence. Persisted inventory alone must not
// be used to implement SessionOwnerResolver.
type SessionOwner struct {
	UID   uint32
	Live  bool
	Known bool
}

type SessionOwnerResolver interface {
	ResolveSessionOwner(sessionID string) (SessionOwner, error)
}

// PrincipalUIDResolver must map an independently authenticated application
// principal to the OS UID that principal is authorized to observe. It must not
// derive the mapping from grant claims or client-supplied identity fields.
type PrincipalUIDResolver interface {
	ResolveOSUID(principal string) (uint32, error)
}

// ReplayStore must atomically claim a JTI until expiry. Implementations must
// be shared by all verifier instances serving the same authority domain.
type ReplayStore interface {
	Consume(jti string, expiresAt time.Time, now time.Time) (bool, error)
}

type GrantVerifier struct {
	Key             []byte
	Issuer          string
	Audience        string
	ExpectedPeerUID uint32 // UID of the Core service connecting to the Agent socket.
	Now             func() time.Time
	Replay          ReplayStore
	Sessions        SessionOwnerResolver
	Principals      PrincipalUIDResolver
}

// Verify checks the signed grant against the independently authenticated app
// principal, the expected Core transport UID, principal-to-OS-UID authorization,
// freshness, one-time use, and runtime session ownership.
//
// peerUID is SO_PEERCRED for the process connecting to Agent (typically Core);
// it is not the target native-session owner's UID. expectedPrincipal must come
// from the authenticated server-side request context.
func (v GrantVerifier) Verify(g SessionGrant, peerUID uint32, expectedPrincipal string) error {
	if len(v.Key) < 32 || v.Issuer == "" || v.Audience == "" ||
		v.ExpectedPeerUID == 0 || expectedPrincipal == "" ||
		v.Replay == nil || v.Sessions == nil || v.Principals == nil || v.Now == nil {
		return fmt.Errorf("%w: verifier configuration incomplete", ErrInvalidGrant)
	}
	if g.Version != 1 || g.Issuer != v.Issuer || g.Audience != v.Audience ||
		g.Principal == "" || g.Principal != expectedPrincipal || g.UID == 0 || g.Scope != ReadSessionScope ||
		g.SessionID == "" || g.JTI == "" || strings.TrimSpace(g.JTI) != g.JTI ||
		g.IssuedAt <= 0 || g.ExpiresAt <= g.IssuedAt {
		return ErrInvalidGrant
	}
	claims, err := claimsJSON(g)
	if err != nil {
		return ErrInvalidGrant
	}
	mac := hmac.New(sha256.New, v.Key)
	_, _ = mac.Write(claims)
	signature, err := base64.RawURLEncoding.DecodeString(g.Signature)
	if err != nil || !hmac.Equal(signature, mac.Sum(nil)) {
		return ErrInvalidGrant
	}

	now := v.Now()
	nowUnix := now.Unix()
	// Short-lived assertion: maximum lifetime is 60 seconds. A small future
	// issuance tolerance is intentionally not provided; clock skew must be
	// solved by synchronized service clocks, not permissive authorization.
	if g.IssuedAt > nowUnix || g.ExpiresAt <= nowUnix || g.ExpiresAt-g.IssuedAt > 60 {
		return ErrInvalidGrant
	}

	// SO_PEERCRED authenticates the connecting service process, not the browser
	// user or target session owner. Check it against explicit service identity;
	// independently resolve the app principal to the authorized target UID.
	if peerUID == 0 || peerUID != v.ExpectedPeerUID {
		return ErrInvalidGrant
	}
	authorizedUID, err := v.Principals.ResolveOSUID(expectedPrincipal)
	if err != nil || authorizedUID == 0 || authorizedUID != g.UID {
		return ErrInvalidGrant
	}

	owner, err := v.Sessions.ResolveSessionOwner(g.SessionID)
	if err != nil || !owner.Known || !owner.Live || owner.UID == 0 || owner.UID != g.UID {
		return ErrInvalidGrant
	}

	// Claim only after all other checks, using an atomic store operation to
	// prevent concurrent requests from consuming the same assertion twice.
	consumed, err := v.Replay.Consume(g.JTI, time.Unix(g.ExpiresAt, 0), now)
	if err != nil {
		return fmt.Errorf("%w: replay store unavailable", ErrInvalidGrant)
	}
	if !consumed {
		return ErrReplay
	}
	return nil
}

func claimsJSON(g SessionGrant) ([]byte, error) {
	claims := struct {
		Version   int    `json:"version"`
		Issuer    string `json:"iss"`
		Audience  string `json:"aud"`
		Principal string `json:"sub"`
		UID       uint32 `json:"uid"`
		Scope     string `json:"scope"`
		SessionID string `json:"sid"`
		IssuedAt  int64  `json:"iat"`
		ExpiresAt int64  `json:"exp"`
		JTI       string `json:"jti"`
	}{g.Version, g.Issuer, g.Audience, g.Principal, g.UID, g.Scope, g.SessionID, g.IssuedAt, g.ExpiresAt, g.JTI}
	return json.Marshal(claims)
}

// signForTest is intentionally unexported to production callers. Production
// issuance/key custody is a separate design and must not be inferred from this
// verifier-only slice.
func signForTest(g SessionGrant, key []byte) (SessionGrant, error) {
	claims, err := claimsJSON(g)
	if err != nil {
		return SessionGrant{}, err
	}
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write(claims)
	g.Signature = base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return g, nil
}

type memoryReplayStore struct {
	mu sync.Mutex
	seen map[string]time.Time
}

func newMemoryReplayStore() *memoryReplayStore {
	return &memoryReplayStore{seen: make(map[string]time.Time)}
}

func (s *memoryReplayStore) Consume(jti string, expiresAt, now time.Time) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for key, expiry := range s.seen {
		if !expiry.After(now) {
			delete(s.seen, key)
		}
	}
	if _, exists := s.seen[jti]; exists {
		return false, nil
	}
	s.seen[jti] = expiresAt
	return true, nil
}
