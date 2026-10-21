package security

import (
	"errors"
	"testing"
	"time"
)

type testSessionResolver map[string]SessionOwner

func (r testSessionResolver) ResolveSessionOwner(id string) (SessionOwner, error) {
	owner, ok := r[id]
	if !ok {
		return SessionOwner{}, errors.New("unknown session")
	}
	return owner, nil
}

func newVerifier(now time.Time, owners testSessionResolver) (GrantVerifier, *memoryReplayStore, []byte) {
	key := []byte("0123456789abcdef0123456789abcdef")
	replay := newMemoryReplayStore()
	return GrantVerifier{
		Key: key, Issuer: "gpupanel-core", Audience: "gpupanel-agent-session-read",
		Now: func() time.Time { return now }, Replay: replay, Sessions: owners,
	}, replay, key
}

func validGrant(now time.Time) SessionGrant {
	return SessionGrant{
		Version: 1, Issuer: "gpupanel-core", Audience: "gpupanel-agent-session-read",
		Principal: "user-42", UID: 1001, Scope: ReadSessionScope,
		SessionID: "runtime-session-abc", IssuedAt: now.Unix() - 1,
		ExpiresAt: now.Unix() + 20, JTI: "random-one-time-id",
	}
}

func signed(t *testing.T, g SessionGrant, key []byte) SessionGrant {
	t.Helper()
	result, err := signForTest(g, key)
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func TestGrantVerifierAcceptsExactFreshReadOnlySessionGrantOnce(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	owners := testSessionResolver{"runtime-session-abc": {UID: 1001, Live: true, Known: true}}
	v, _, key := newVerifier(now, owners)
	g := signed(t, validGrant(now), key)
	if err := v.Verify(g, 1001, "user-42"); err != nil {
		t.Fatalf("valid grant rejected: %v", err)
	}
	if err := v.Verify(g, 1001); !errors.Is(err, ErrReplay) {
		t.Fatalf("second use must be rejected as replay, got %v", err)
	}
}

func TestGrantVerifierRejectsNegativeSecurityCases(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	owners := testSessionResolver{
		"runtime-session-abc": {UID: 1001, Live: true, Known: true},
		"other-user-session":  {UID: 2002, Live: true, Known: true},
		"dead-session":        {UID: 1001, Live: false, Known: true},
		"unknown-owner":       {UID: 0, Live: false, Known: false},
	}
	cases := []struct {
		name string
		mutate func(*SessionGrant)
		peerUID uint32
	}{
		{"expired", func(g *SessionGrant) { g.ExpiresAt = now.Unix() }, 1001},
		{"future-issued", func(g *SessionGrant) { g.IssuedAt = now.Unix() + 1 }, 1001},
		{"lifetime-over-60-seconds", func(g *SessionGrant) { g.IssuedAt = now.Unix() - 61; g.ExpiresAt = now.Unix() + 1 }, 1001},
		{"wrong-uid-claim", func(g *SessionGrant) { g.UID = 2002 }, 1001},
		{"wrong-peer-uid", func(*SessionGrant) {}, 2002},
		{"root-peer", func(*SessionGrant) {}, 0},
		{"wrong-audience", func(g *SessionGrant) { g.Audience = "other-agent" }, 1001},
		{"wrong-scope", func(g *SessionGrant) { g.Scope = "session:read session:write" }, 1001},
		{"empty-principal", func(g *SessionGrant) { g.Principal = "" }, 1001},
		{"different-authenticated-principal", func(g *SessionGrant) { g.Principal = "user-evil" }, 1001},
		{"empty-session", func(g *SessionGrant) { g.SessionID = "" }, 1001},
		{"empty-jti", func(g *SessionGrant) { g.JTI = "" }, 1001},
		{"session-owned-by-other-uid", func(g *SessionGrant) { g.SessionID = "other-user-session" }, 1001},
		{"unknown-session", func(g *SessionGrant) { g.SessionID = "missing-session" }, 1001},
		{"unknown-session-owner", func(g *SessionGrant) { g.SessionID = "unknown-owner" }, 1001},
		{"non-live-session", func(g *SessionGrant) { g.SessionID = "dead-session" }, 1001},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			v, _, key := newVerifier(now, owners)
			g := validGrant(now)
			tc.mutate(&g)
			g = signed(t, g, key)
			if err := v.Verify(g, tc.peerUID, "user-42"); err == nil {
				t.Fatal("negative case unexpectedly accepted")
			}
		})
	}
}

func TestGrantVerifierRejectsTamperingAndInvalidConfiguration(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	owners := testSessionResolver{"runtime-session-abc": {UID: 1001, Live: true, Known: true}}
	v, _, key := newVerifier(now, owners)
	g := signed(t, validGrant(now), key)
	g.Scope = "session:write"
	if err := v.Verify(g, 1001); err == nil {
		t.Fatal("tampered claims unexpectedly accepted")
	}

	v.Key = []byte("too-short")
	g = signed(t, validGrant(now), key)
	if err := v.Verify(g, 1001); err == nil {
		t.Fatal("short verification key unexpectedly accepted")
	}
}

func TestGrantVerifierFailsClosedWhenReplayStoreOrSessionResolverFails(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	owners := testSessionResolver{"runtime-session-abc": {UID: 1001, Live: true, Known: true}}
	v, _, key := newVerifier(now, owners)
	g := signed(t, validGrant(now), key)
	v.Replay = failingReplayStore{}
	if err := v.Verify(g, 1001); err == nil {
		t.Fatal("replay-store failure must deny")
	}
	v, _, key = newVerifier(now, testSessionResolver{})
	g = signed(t, validGrant(now), key)
	if err := v.Verify(g, 1001); err == nil {
		t.Fatal("unknown session must deny")
	}
}

type failingReplayStore struct{}
func (failingReplayStore) Consume(string, time.Time, time.Time) (bool, error) {
	return false, errors.New("store unavailable")
}
