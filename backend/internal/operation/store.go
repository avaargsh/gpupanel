// SPDX-License-Identifier: Apache-2.0

package operation

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"sync"
	"time"
)

// Config declares the explicit bounds of a Store. Every bound is required:
// a hidden default would hide the capacity decision from its owner.
type Config struct {
	Capacity       int           // maximum physical records held at once
	RecordTTL      time.Duration // lifetime measured from creation
	RunningTimeout time.Duration // bounded Begin-to-terminal time before Reconcile forces unknown
	Clock          Clock         // optional; nil selects the system clock
}

// Store is a bounded in-memory operation registry. It is not durable: every
// record is lost on process restart and no record can be restored in a way that
// lets this package replay anything (see README.md).
//
// A Store is a plain struct guarded by one mutex; it spawns no goroutines,
// keeps no queue and holds no package-level state. Zero value is unusable;
// construct with New.
type Store struct {
	mu       sync.Mutex
	capacity int
	ttl      time.Duration
	timeout  time.Duration
	clock    Clock

	byID       map[string]*record
	byOwnerKey map[ownerKey]string
	nextSeq    uint64
}

// record is store-internal mutable state. It is never handed out: snapshots
// are converted on read so no caller shares a pointer with the store.
type record struct {
	id           string
	seq          uint64 // monotonic creation order; map iteration is not an order
	owner        Owner
	resource     string
	key          string
	digest       [sha256.Size]byte
	state        State
	createdAt    time.Time
	startedAt    time.Time
	deadline     time.Time
	endedAt      time.Time
	expiresAt    time.Time
	verification *Verification
}

// ownerKey is the idempotency identity: keys are scoped per owner, so two
// owners may use the same key string without observing each other's records.
type ownerKey struct {
	owner Owner
	key   string
}

// dead reports whether the record has passed its retention lifetime. A running
// record is never dead: its lifetime is governed by the bounded running
// timeout (applied via Reconcile), not by the record TTL.
func (r *record) dead(now time.Time) bool {
	return r.state != StateRunning && !now.Before(r.expiresAt)
}

// New builds a Store. It fails on any missing bound rather than guessing one.
func New(cfg Config) (*Store, error) {
	if cfg.Capacity <= 0 {
		return nil, fmt.Errorf("%w: capacity must be positive, got %d", ErrInvalidConfig, cfg.Capacity)
	}
	if cfg.RecordTTL <= 0 {
		return nil, fmt.Errorf("%w: record TTL must be positive, got %s", ErrInvalidConfig, cfg.RecordTTL)
	}
	if cfg.RunningTimeout <= 0 {
		return nil, fmt.Errorf("%w: running timeout must be positive, got %s", ErrInvalidConfig, cfg.RunningTimeout)
	}
	if cfg.RecordTTL <= cfg.RunningTimeout {
		return nil, fmt.Errorf("%w: record TTL (%s) must exceed running timeout (%s) or running records expire before they can time out",
			ErrInvalidConfig, cfg.RecordTTL, cfg.RunningTimeout)
	}
	clk := cfg.Clock
	if clk == nil {
		clk = systemClock{}
	}
	return &Store{
		capacity:   cfg.Capacity,
		ttl:        cfg.RecordTTL,
		timeout:    cfg.RunningTimeout,
		clock:      clk,
		byID:       make(map[string]*record),
		byOwnerKey: make(map[ownerKey]string),
	}, nil
}

// Claim atomically reserves the operation identity (owner, key) or, when that
// identity already exists, replays it. Exactly one of any number of concurrent
// identical claims creates the record; the rest observe replayed == true.
//
// Rejection rules for an existing identity, in order: resource binding change
// -> ErrBindingMismatch, parameter digest change -> ErrDigestMismatch,
// expired record -> ErrExpired (the key stays reserved until Reconcile purges
// it, which prevents a silent duplicate identity). When no identity exists the
// claim is rejected with ErrCapacity if the physical bound is reached; live
// records are never evicted to make room.
//
// A cancelled context is honoured before any mutation.
func (s *Store) Claim(ctx context.Context, req ClaimRequest) (Operation, bool, error) {
	if err := ctx.Err(); err != nil {
		return Operation{}, false, err
	}
	if err := validateClaim(req); err != nil {
		return Operation{}, false, err
	}
	digest := sha256.Sum256(req.Params)

	s.mu.Lock()
	defer s.mu.Unlock()

	if id, ok := s.byOwnerKey[ownerKey{owner: req.Owner, key: req.Key}]; ok {
		rec := s.byID[id]
		if rec.resource != req.Resource {
			return Operation{}, false, fmt.Errorf("%w: identity %s bound to another resource", ErrBindingMismatch, rec.id)
		}
		if rec.digest != digest {
			return Operation{}, false, fmt.Errorf("%w: identity %s bound to other parameters", ErrDigestMismatch, rec.id)
		}
		if rec.dead(s.clock.Now()) {
			return Operation{}, false, fmt.Errorf("%w: identity %s past %s", ErrExpired, rec.id, rec.expiresAt.Format(time.RFC3339Nano))
		}
		return snapshot(rec), true, nil
	}

	if len(s.byID) >= s.capacity {
		return Operation{}, false, fmt.Errorf("%w: %d of %d records in use", ErrCapacity, len(s.byID), s.capacity)
	}

	id, err := s.newIdentityLocked()
	if err != nil {
		return Operation{}, false, err
	}
	now := s.clock.Now()
	s.nextSeq++
	rec := &record{
		id:        id,
		seq:       s.nextSeq,
		owner:     req.Owner,
		resource:  req.Resource,
		key:       req.Key,
		digest:    digest,
		state:     StatePlanned,
		createdAt: now,
		expiresAt: now.Add(s.ttl),
	}
	s.byID[rec.id] = rec
	s.byOwnerKey[ownerKey{owner: rec.owner, key: rec.key}] = rec.id
	return snapshot(rec), false, nil
}

// Get returns a read-only snapshot. It never mutates, executes or reconciles
// anything, even when the record is past its running timeout; only Reconcile
// applies clock-driven changes.
func (s *Store) Get(ctx context.Context, owner Owner, id string) (Operation, error) {
	if err := ctx.Err(); err != nil {
		return Operation{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	rec, err := s.lookupLocked(owner, id)
	if err != nil {
		return Operation{}, err
	}
	return snapshot(rec), nil
}

// List returns snapshots of the owner's live records in creation order.
// Expired records are omitted; they remain physically present (and count
// against capacity) until Reconcile purges them.
func (s *Store) List(ctx context.Context, owner Owner) ([]Operation, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.clock.Now()
	owned := make([]*record, 0, len(s.byID))
	for _, rec := range s.byID {
		if rec.owner == owner && !rec.dead(now) {
			owned = append(owned, rec)
		}
	}
	sort.Slice(owned, func(i, j int) bool { return owned[i].seq < owned[j].seq })
	out := make([]Operation, 0, len(owned))
	for _, rec := range owned {
		out = append(out, snapshot(rec))
	}
	return out, nil
}

// Begin atomically moves planned -> running and arms the bounded timeout.
// It is replay-safe: calling Begin on an already running operation returns the
// same snapshot with transitioned == false, so concurrent Begins result in
// exactly one transition. Any other state is ErrInvalidTransition.
func (s *Store) Begin(ctx context.Context, owner Owner, id string) (Operation, bool, error) {
	if err := ctx.Err(); err != nil {
		return Operation{}, false, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	rec, err := s.lookupLocked(owner, id)
	if err != nil {
		return Operation{}, false, err
	}
	if rec.state == StateRunning {
		return snapshot(rec), false, nil
	}
	if rec.state != StatePlanned {
		return Operation{}, false, fmt.Errorf("%w: Begin requires planned, %s is %s", ErrInvalidTransition, rec.id, rec.state)
	}
	now := s.clock.Now()
	rec.state = StateRunning
	rec.startedAt = now
	rec.deadline = now.Add(s.timeout)
	return snapshot(rec), true, nil
}

// Complete moves running -> completed. Terminal reports are one-shot: a
// duplicate or out-of-order report is ErrInvalidTransition, never a silent
// success. Idempotency is provided by Claim replay instead.
func (s *Store) Complete(ctx context.Context, owner Owner, id string) (Operation, error) {
	return s.terminate(ctx, owner, id, StateCompleted)
}

// Fail moves running -> failed with the same one-shot rules as Complete.
func (s *Store) Fail(ctx context.Context, owner Owner, id string) (Operation, error) {
	return s.terminate(ctx, owner, id, StateFailed)
}

func (s *Store) terminate(ctx context.Context, owner Owner, id string, target State) (Operation, error) {
	if err := ctx.Err(); err != nil {
		return Operation{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	rec, err := s.lookupLocked(owner, id)
	if err != nil {
		return Operation{}, err
	}
	if rec.state != StateRunning {
		return Operation{}, fmt.Errorf("%w: %s requires running, %s is %s", ErrInvalidTransition, target, rec.id, rec.state)
	}
	rec.state = target
	rec.endedAt = s.clock.Now()
	return snapshot(rec), nil
}

// lookupLocked resolves an id under the caller's owner. Unknown ids report
// ErrNotFound; ids owned by another principal report ErrOwnershipDenied so a
// foreign owner learns nothing about the record beyond the denial; expired
// records report ErrExpired.
func (s *Store) lookupLocked(owner Owner, id string) (*record, error) {
	rec, ok := s.byID[id]
	if !ok {
		return nil, fmt.Errorf("%w: id %s", ErrNotFound, id)
	}
	if rec.owner != owner {
		return nil, fmt.Errorf("%w: id %s", ErrOwnershipDenied, id)
	}
	if rec.dead(s.clock.Now()) {
		return nil, fmt.Errorf("%w: id %s", ErrExpired, id)
	}
	return rec, nil
}

// newIdentityLocked generates a fresh identity while the store lock is held,
// with a bounded attempt count; a collision never loops forever.
func (s *Store) newIdentityLocked() (string, error) {
	const attempts = 4
	var buf [16]byte
	for i := 0; i < attempts; i++ {
		if _, err := rand.Read(buf[:]); err != nil {
			return "", fmt.Errorf("operation: identity generation: %w", err)
		}
		id := "op_" + hex.EncodeToString(buf[:])
		if _, taken := s.byID[id]; !taken {
			return id, nil
		}
	}
	return "", fmt.Errorf("operation: identity generation exhausted %d attempts", attempts)
}

// snapshot converts a record into a caller-owned value; the verification
// pointer is deep-copied so callers never alias store-internal state.
func snapshot(rec *record) Operation {
	op := Operation{
		ID:           rec.id,
		Owner:        rec.owner,
		Resource:     rec.resource,
		Key:          rec.key,
		ParamsDigest: hex.EncodeToString(rec.digest[:]),
		State:        rec.state,
		CreatedAt:    rec.createdAt,
		StartedAt:    rec.startedAt,
		Deadline:     rec.deadline,
		EndedAt:      rec.endedAt,
		ExpiresAt:    rec.expiresAt,
	}
	if rec.verification != nil {
		v := *rec.verification
		op.Verification = &v
	}
	return op
}

func validateClaim(req ClaimRequest) error {
	if req.Owner == "" {
		return fmt.Errorf("%w: owner is required", ErrInvalidRequest)
	}
	if len(req.Owner) > MaxOwnerBytes {
		return fmt.Errorf("%w: owner exceeds %d bytes", ErrInvalidRequest, MaxOwnerBytes)
	}
	if req.Key == "" {
		return fmt.Errorf("%w: key is required", ErrInvalidRequest)
	}
	if len(req.Key) > MaxKeyBytes {
		return fmt.Errorf("%w: key exceeds %d bytes", ErrInvalidRequest, MaxKeyBytes)
	}
	if req.Resource == "" {
		return fmt.Errorf("%w: resource is required", ErrInvalidRequest)
	}
	if len(req.Resource) > MaxResourceBytes {
		return fmt.Errorf("%w: resource exceeds %d bytes", ErrInvalidRequest, MaxResourceBytes)
	}
	if len(req.Params) > MaxParamsBytes {
		return fmt.Errorf("%w: params exceed %d bytes", ErrInvalidRequest, MaxParamsBytes)
	}
	return nil
}
