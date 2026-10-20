// Package principalproof contains a bounded, ephemeral evidence gate for a
// GPUPanel web session and a real local Linux UID. It is not a login system
// and cannot authorize process execution, file reads, or a native Agent.
package principalproof

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"regexp"
	"sync"
	"time"
)

var (
	ErrInvalidRequest = errors.New("principal proof: invalid request")
	ErrCapacity       = errors.New("principal proof: capacity reached")
	ErrNotPending     = errors.New("principal proof: unknown, expired, or consumed challenge")
	ErrWrongUID       = errors.New("principal proof: wrong Linux user")
)

const (
	ChallengeTTL = 60 * time.Second
	ProofTTL     = 5 * time.Minute
	MaxPending   = 64
)

var sessionDigestPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

// Proof is proof of a recent local socket peer, NOT a delegated capability.
// In particular, no method in this package starts commands or reads a home.
type Proof struct {
	UID                 uint32    `json:"uid"`
	ExpiresAt           time.Time `json:"expiresAt"`
	IdentityObserved    bool      `json:"identityObserved"`
	ExecutionAuthorized bool      `json:"executionAuthorized"`
}

type challenge struct {
	session string // SHA-256 digest of a freshly authenticated browser session; never its cookie
	uid     uint32
	expires time.Time
}

// Store is deliberately in-memory. Restart, revoke, expiration and initiating
// another challenge invalidate old proofs. The HTTP session MUST be checked
// separately on every use of any proof; retaining a digest is not authentication.
type Store struct {
	mu      sync.Mutex
	clock   func() time.Time
	pending map[string]challenge
	proofs  map[string]Proof
}

func New(clock func() time.Time) *Store {
	if clock == nil {
		clock = time.Now
	}
	return &Store{clock: clock, pending: make(map[string]challenge), proofs: make(map[string]Proof)}
}

func valid(sessionDigest string, uid uint32) bool {
	return sessionDigestPattern.MatchString(sessionDigest) && uid >= 1000 && uid <= 60000
}

func (s *Store) purge(now time.Time) {
	for token, entry := range s.pending {
		if !now.Before(entry.expires) {
			delete(s.pending, token)
		}
	}
	for session, proof := range s.proofs {
		if !now.Before(proof.ExpiresAt) {
			delete(s.proofs, session)
		}
	}
}

// Begin records the UID *requested* by the currently authenticated Web
// session. This untrusted requested UID cannot become a proof without kernel
// peer credentials from VerifyUnixPeer. Never put this token in logs or URLs.
func (s *Store) Begin(sessionDigest string, requestedUID uint32) (string, error) {
	if !valid(sessionDigest, requestedUID) {
		return "", ErrInvalidRequest
	}
	var bytes [32]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", err
	}
	token := base64.RawURLEncoding.EncodeToString(bytes[:])
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.clock()
	s.purge(now)
	for pending, item := range s.pending {
		if item.session == sessionDigest {
			delete(s.pending, pending)
		}
	}
	// Even if challenge issuance is denied by capacity, do not preserve an
	// earlier verified UID after an attempt to replace it.
	delete(s.proofs, sessionDigest)
	if len(s.pending) >= MaxPending {
		return "", ErrCapacity
	}
	s.pending[token] = challenge{session: sessionDigest, uid: requestedUID, expires: now.Add(ChallengeTTL)}
	return token, nil
}

// finish is private: callers must supply the UID from SO_PEERCRED, NEVER
// from JSON, an HTTP header, a user-controlled directory or a command output.
func (s *Store) finish(token string, observedUID uint32) (Proof, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.clock()
	entry, found := s.pending[token]
	if !found {
		return Proof{}, ErrNotPending
	}
	delete(s.pending, token) // consume regardless of outcome: no replay
	if !now.Before(entry.expires) {
		return Proof{}, ErrNotPending
	}
	// Both values are kernel/user-derived integers; constant-time comparison
	// is not a secret boundary, but avoids differentiating candidate tokens.
	var actual [4]byte
	var expected [4]byte
	for i := 0; i < 4; i++ {
		actual[i] = byte(observedUID >> (i * 8))
		expected[i] = byte(entry.uid >> (i * 8))
	}
	if subtle.ConstantTimeCompare(actual[:], expected[:]) != 1 || !valid(entry.session, observedUID) {
		return Proof{}, ErrWrongUID
	}
	proof := Proof{
		UID: observedUID, ExpiresAt: now.Add(ProofTTL),
		IdentityObserved: true, ExecutionAuthorized: false,
	}
	s.proofs[entry.session] = proof
	return proof, nil
}

// Lookup requires a valid authenticated session digest supplied by the HTTP
// auth layer. The proof cannot outlive its TTL and is not execution authority.
func (s *Store) Lookup(sessionDigest string) (Proof, bool) {
	if !sessionDigestPattern.MatchString(sessionDigest) {
		return Proof{}, false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.clock()
	s.purge(now)
	proof, ok := s.proofs[sessionDigest]
	return proof, ok
}

// Revoke must be called at logout, password/session rotation, or when an
// existing verified Linux principal is intentionally changed.
func (s *Store) Revoke(sessionDigest string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.proofs, sessionDigest)
	for token, item := range s.pending {
		if item.session == sessionDigest {
			delete(s.pending, token)
		}
	}
}
