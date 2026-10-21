package security

import (
	"errors"
	"sync"
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

type testPrincipalUIDResolver map[string]uint32

func (r testPrincipalUIDResolver) ResolveOSUID(principal string) (uint32, error) {
	uid, ok := r[principal]
	if !ok {
		return 0, errors.New("principal has no authorized OS UID")
	}
	return uid, nil
}

func newVerifier(now time.Time, owners testSessionResolver) (GrantVerifier, *memoryReplayStore, []byte) {
	key := []byte("0123456789abcdef0123456789abcdef")
	replay := newMemoryReplayStore()
	return GrantVerifier{
		Key: key, Issuer: "gpupanel-core", Audience: "gpupanel-agent-session-read",
		ExpectedPeerUID: 900, // Core service UID; deliberately differs from native session UID.
		Now: func() time.Time { return now }, Replay: replay, Sessions: owners,
		Principals: testPrincipalUIDResolver{"user-42": 1001, "user-2002": 2002},
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
	if err := v.Verify(g, 900, "user-42"); err != nil {
		t.Fatalf("valid grant rejected: %v", err)
	}
	if err := v.Verify(g, 900, "user-42"); !errors.Is(err, ErrReplay) {
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
		authPrincipal string
	}{
		{"expired", func(g *SessionGrant) { g.ExpiresAt = now.Unix() }, 900, "user-42"},
		{"future-issued", func(g *SessionGrant) { g.IssuedAt = now.Unix() + 1 }, 900, "user-42"},
		{"lifetime-over-60-seconds", func(g *SessionGrant) { g.IssuedAt = now.Unix() - 61; g.ExpiresAt = now.Unix() + 1 }, 900, "user-42"},
		{"wrong-uid-claim", func(g *SessionGrant) { g.UID = 2002 }, 900, "user-42"},
		{"wrong-peer-uid", func(*SessionGrant) {}, 2002, "user-42"},
		{"root-peer", func(*SessionGrant) {}, 0, "user-42"},
		{"wrong-audience", func(g *SessionGrant) { g.Audience = "other-agent" }, 900, "user-42"},
		{"wrong-scope", func(g *SessionGrant) { g.Scope = "session:read session:write" }, 900, "user-42"},
		{"empty-principal", func(g *SessionGrant) { g.Principal = "" }, 900, "user-42"},
		{"different-authenticated-principal", func(g *SessionGrant) { g.Principal = "user-evil" }, 900, "user-42"},
		{"unmapped-principal", func(g *SessionGrant) { g.Principal = "user-unmapped" }, 900, "user-unmapped"},
		{"empty-session", func(g *SessionGrant) { g.SessionID = "" }, 900, "user-42"},
		{"empty-jti", func(g *SessionGrant) { g.JTI = "" }, 900, "user-42"},
		{"session-owned-by-other-uid", func(g *SessionGrant) { g.SessionID = "other-user-session" }, 900, "user-42"},
		{"unknown-session", func(g *SessionGrant) { g.SessionID = "missing-session" }, 900, "user-42"},
		{"unknown-session-owner", func(g *SessionGrant) { g.SessionID = "unknown-owner" }, 900, "user-42"},
		{"non-live-session", func(g *SessionGrant) { g.SessionID = "dead-session" }, 900, "user-42"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			v, _, key := newVerifier(now, owners)
			g := validGrant(now)
			tc.mutate(&g)
			g = signed(t, g, key)
			if err := v.Verify(g, tc.peerUID, tc.authPrincipal); err == nil {
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
	if err := v.Verify(g, 900, "user-42"); err == nil {
		t.Fatal("tampered claims unexpectedly accepted")
	}

	v.Key = []byte("too-short")
	g = signed(t, validGrant(now), key)
	if err := v.Verify(g, 900, "user-42"); err == nil {
		t.Fatal("short verification key unexpectedly accepted")
	}
}

func TestGrantVerifierFailsClosedWhenReplayStoreOrSessionResolverFails(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	owners := testSessionResolver{"runtime-session-abc": {UID: 1001, Live: true, Known: true}}
	v, _, key := newVerifier(now, owners)
	g := signed(t, validGrant(now), key)
	v.Replay = failingReplayStore{}
	if err := v.Verify(g, 900, "user-42"); err == nil {
		t.Fatal("replay-store failure must deny")
	}
	v, _, key = newVerifier(now, testSessionResolver{})
	g = signed(t, validGrant(now), key)
	if err := v.Verify(g, 900, "user-42"); err == nil {
		t.Fatal("unknown session must deny")
	}
}

func TestGrantVerifierFailsClosedWithoutPrincipalUIDResolver(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	owners := testSessionResolver{"runtime-session-abc": {UID: 1001, Live: true, Known: true}}
	v, _, key := newVerifier(now, owners)
	g := signed(t, validGrant(now), key)
	v.Principals = nil
	if err := v.Verify(g, 900, "user-42"); err == nil {
		t.Fatal("missing principal-to-UID resolver must deny")
	}
}

type failingReplayStore struct{}

func (failingReplayStore) Consume(string, time.Time, time.Time) (bool, error) {
	return false, errors.New("store unavailable")
}


// TestGrantVerifierConcurrentReplayOnlyAllowsOneUse proves that concurrent
// attempts to consume the same signed grant cannot both pass the replay gate.
// This exercises the in-memory test store contract, not a production backend.
func TestGrantVerifierConcurrentReplayOnlyAllowsOneUse(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	owners := testSessionResolver{"runtime-session-abc": {UID: 1001, Live: true, Known: true}}
	v, _, key := newVerifier(now, owners)
	g := signed(t, validGrant(now), key)

	const workers = 32
	results := make(chan error, workers)
	var wg sync.WaitGroup
	wg.Add(workers)
	for i := 0; i < workers; i++ {
		go func() {
			defer wg.Done()
			results <- v.Verify(g, 900, "user-42")
		}()
	}
	wg.Wait()
	close(results)

	accepted, replayed := 0, 0
	for err := range results {
		switch {
		case err == nil:
			accepted++
		case errors.Is(err, ErrReplay):
			replayed++
		default:
			t.Errorf("unexpected verifier error: %v", err)
		}
	}
	if accepted != 1 || replayed != workers-1 {
		t.Fatalf("expected exactly one accepted use and %d replay denials; accepted=%d replayed=%d", workers-1, accepted, replayed)
	}
}

// TestGrantVerifierRejectsMalformedSignatureIssuerAndVersion complements the
// claim-mismatch matrix with malformed signature encoding and issuer/version
// mismatches. Mutated claims are re-signed here so each claim check is isolated.
func TestGrantVerifierRejectsMalformedSignatureIssuerAndVersion(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	owners := testSessionResolver{"runtime-session-abc": {UID: 1001, Live: true, Known: true}}
	v, _, key := newVerifier(now, owners)

	t.Run("malformed-signature", func(t *testing.T) {
		g := signed(t, validGrant(now), key)
		g.Signature = "not*base64!"
		if err := v.Verify(g, 900, "user-42"); err == nil {
			t.Fatal("malformed signature unexpectedly accepted")
		}
	})
	t.Run("wrong-issuer", func(t *testing.T) {
		g := validGrant(now)
		g.Issuer = "untrusted-issuer"
		g = signed(t, g, key)
		if err := v.Verify(g, 900, "user-42"); err == nil {
			t.Fatal("wrong issuer unexpectedly accepted")
		}
	})
	t.Run("unsupported-version", func(t *testing.T) {
		g := validGrant(now)
		g.Version = 2
		g = signed(t, g, key)
		if err := v.Verify(g, 900, "user-42"); err == nil {
			t.Fatal("unsupported grant version unexpectedly accepted")
		}
	})
}
