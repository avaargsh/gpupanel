package principalproof

import (
	"crypto/sha256"
	"fmt"
	"strings"
	"testing"
	"time"
)

func key(label string) string { return fmt.Sprintf("%x", sha256.Sum256([]byte(label))) }

func TestPrincipalProofRequiresActualMatchingPeerAndNeverAuthorizesExecution(t *testing.T) {
	now := time.Date(2026, 10, 20, 10, 0, 0, 0, time.UTC)
	store := New(func() time.Time { return now })
	a, b := key("web-session-a"), key("web-session-b")
	token, err := store.Begin(a, 1001)
	if err != nil { t.Fatal(err) }
	if len(token) != 43 || strings.ContainsAny(token, "/+=\n ") {
		t.Fatalf("unexpected challenge format")
	}
	if _, ok := store.Lookup(a); ok { t.Fatal("unverified user gained proof") }
	if _, err := store.finish(token, 1002); err != ErrWrongUID { t.Fatalf("wrong UID: %v", err) }
	if _, err := store.finish(token, 1001); err != ErrNotPending { t.Fatalf("challenge replay: %v", err) }
	if _, ok := store.Lookup(a); ok { t.Fatal("wrong UID created proof") }

	fresh, err := store.Begin(a, 1001)
	if err != nil { t.Fatal(err) }
	proof, err := store.finish(fresh, 1001)
	if err != nil { t.Fatal(err) }
	if proof.UID != 1001 || !proof.IdentityObserved || proof.ExecutionAuthorized {
		t.Fatalf("proof escalated to execution: %+v", proof)
	}
	if _, ok := store.Lookup(b); ok { t.Fatal("independent web session inherited proof") }
	if readback, ok := store.Lookup(a); !ok || readback.ExecutionAuthorized {
		t.Fatal("verified proof not read back safely")
	}
	if _, err := store.finish(fresh, 1001); err != ErrNotPending { t.Fatal("accepted one-time token twice") }

	_, err = store.Begin(a, 1002)
	if err != nil { t.Fatal(err) }
	if _, ok := store.Lookup(a); ok { t.Fatal("principal replacement retained old proof") }
	store.Revoke(a)
	if _, ok := store.Lookup(a); ok { t.Fatal("revoke preserved proof") }
}

func TestProofTTLAndSessionRevocation(t *testing.T) {
	now := time.Unix(1792490400, 0)
	store := New(func() time.Time { return now })
	a := key("session-a")
	nonce, _ := store.Begin(a, 1000)
	now = now.Add(ChallengeTTL)
	if _, err := store.finish(nonce, 1000); err != ErrNotPending { t.Fatalf("expired challenge: %v", err) }
	nonce, _ = store.Begin(a, 1000)
	_, err := store.finish(nonce, 1000)
	if err != nil { t.Fatal(err) }
	now = now.Add(ProofTTL)
	if _, ok := store.Lookup(a); ok { t.Fatal("expired proof remained valid") }

	nonce, _ = store.Begin(a, 1000)
	store.Revoke(a)
	if _, err := store.finish(nonce, 1000); err != ErrNotPending { t.Fatal("revoked pending challenge accepted") }
}

func TestCapacityInvalidIdentityAndIsolation(t *testing.T) {
	store := New(nil)
	for _, tc := range []struct { digest string; uid uint32 }{
		{"admin", 1000}, {key("root"), 0}, {key("service"), 999},
		{key("high"), 60001}, {strings.Repeat("A", 64), 1000},
	} {
		if _, err := store.Begin(tc.digest, tc.uid); err != ErrInvalidRequest {
			t.Errorf("accepted invalid principal candidate: %+v err=%v", tc, err)
		}
	}
	first := ""
	for i := 0; i < MaxPending; i++ {
		token, err := store.Begin(key(fmt.Sprint("pending-", i)), 1000)
		if err != nil { t.Fatal(err) }
		if i == 0 { first = token }
	}
	if _, err := store.Begin(key("over-cap"), 1000); err != ErrCapacity {
		t.Fatalf("capacity overflow: %v", err)
	}
	// An attacker presenting another challenge cannot create a valid binding.
	if _, err := store.finish(first, 500); err != ErrWrongUID {
		t.Fatal("unsafe UID created proof")
	}
	if _, err := store.Begin(key("over-cap"), 1000); err != nil {
		t.Fatal("capacity not reclaimed after consumed challenge")
	}
}

func TestRepeatedChallengeInvalidatesPreviousPending(t *testing.T) {
	store := New(nil)
	session := key("single-browser-session")
	first, _ := store.Begin(session, 1002)
	second, _ := store.Begin(session, 1002)
	if first == second { t.Fatal("same random token reused") }
	if _, err := store.finish(first, 1002); err != ErrNotPending { t.Fatal("superseded challenge reused") }
	if _, err := store.finish(second, 1002); err != nil { t.Fatal(err) }
}
