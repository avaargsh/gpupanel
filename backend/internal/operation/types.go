// SPDX-License-Identifier: Apache-2.0

// Package operation implements a bounded, in-memory, typed operation lifecycle
// for a later Assist integration slice.
//
// Scope: operation identity, owner/resource binding, parameter digest binding,
// explicit state transitions, expiry and capacity bounds, clock-driven timeout
// reconciliation and independently verified outcomes.
//
// Deliberate non-goals: this package has no executor, no persistence, no queue,
// no background goroutines, no network or HTTP surface, and no global registry.
// It never runs or replays an operation; queries are read-only.
//
// Trust contract: every call takes an Owner that the caller must have
// established from an authenticated, trusted source upstream. This package
// cannot verify client-claimed identity and provides no HTTP feature; a caller
// that forwards a self-reported owner from a request header or body voids the
// ownership guarantees documented here.
package operation

import (
	"errors"
	"time"
)

// State is the recorded lifecycle state of an operation.
//
// Legal flow: planned -> running -> completed | failed | unknown.
// The unknown state is reached only through Reconcile after a bounded running
// timeout; it is terminal for transitions.
type State string

const (
	StatePlanned   State = "planned"
	StateRunning   State = "running"
	StateCompleted State = "completed"
	StateFailed    State = "failed"
	StateUnknown   State = "unknown"
)

// Valid reports whether s is a state this package can record.
func (s State) Valid() bool {
	switch s {
	case StatePlanned, StateRunning, StateCompleted, StateFailed, StateUnknown:
		return true
	default:
		return false
	}
}

// Terminal reports whether s is a terminal state.
func (s State) Terminal() bool {
	return s == StateCompleted || s == StateFailed || s == StateUnknown
}

// Result is an independently observable outcome. It is distinct from State:
// State is the recorded lifecycle position, Result is what an independent
// observer saw. The two can disagree, and disagreement is preserved rather
// than overwritten.
type Result string

const (
	ResultSucceeded Result = "succeeded"
	ResultFailed    Result = "failed"
	ResultUnknown   Result = "unknown"
)

// Valid reports whether r is a known result.
func (r Result) Valid() bool {
	switch r {
	case ResultSucceeded, ResultFailed, ResultUnknown:
		return true
	default:
		return false
	}
}

// Result returns the outcome implied by a terminal state, or the empty Result
// when s is not terminal.
func (s State) Result() Result {
	switch s {
	case StateCompleted:
		return ResultSucceeded
	case StateFailed:
		return ResultFailed
	case StateUnknown:
		return ResultUnknown
	default:
		return ""
	}
}

// Owner identifies a trusted principal whose identity was established by the
// caller's authentication layer. This package never derives an Owner from
// client-supplied data.
type Owner string

// ClaimRequest is the validated input for claiming an operation identity.
// The raw Params bytes are digested and bound to the identity but never
// retained; callers must re-supply them on retry so the digest can be checked.
type ClaimRequest struct {
	Owner    Owner
	Resource string // resource the operation is scoped to; part of the binding
	Key      string // caller-chosen idempotency key, unique per owner
	Params   []byte // canonical parameter bytes; may be empty
}

// Verification is an independently observed outcome recorded separately from
// the lifecycle state. Evidence is an opaque bounded reference (for example an
// exit-code receipt id or inspect summary); it must never contain secrets.
//
// Ordering caveat (DECISIONS.md D4): At is stamped from the store clock at
// Verify time. With arbitrary injected clocks (steps backward, no monotonic
// reading) At is not guaranteed to sort after EndedAt; timestamps are
// informational and record order is carried by the store sequence, not by
// comparing times.
type Verification struct {
	Source   string    // identity of the independent observation channel
	Result   Result    // what the observer saw
	Evidence string    // bounded opaque evidence reference
	At       time.Time // recorded by the store clock on first verification
}

// Operation is an immutable snapshot of one record as seen by a caller.
// Snapshots never alias store-internal state; mutating a returned value has no
// effect on the store.
type Operation struct {
	ID           string
	Owner        Owner
	Resource     string
	Key          string
	ParamsDigest string // hex-encoded SHA-256 of the claimed parameters
	State        State
	CreatedAt    time.Time
	StartedAt    time.Time     // zero until the operation starts running
	Deadline     time.Time     // zero until running; StartedAt + RunningTimeout
	EndedAt      time.Time     // zero until a terminal state is reached
	ExpiresAt    time.Time     // CreatedAt + RecordTTL
	Verification *Verification // nil until an independent verification is recorded
}

// IndependentlyVerified reports whether an independent verification exists and
// its observed result agrees with the recorded terminal state. A disagreement
// (for example an operation reconciled to unknown that later shows a successful
// observation) stays false: the state remains unknown and the disagreement is
// preserved in Verification.
//
// Warning (DECISIONS.md D3): agreement includes unknown agreeing with unknown,
// so true does NOT mean the outcome succeeded and is NOT a replay-safety gate.
// Gate success on State == StateCompleted && Verification.Result ==
// ResultSucceeded; an unknown state refuses replay regardless of this bool.
func (o Operation) IndependentlyVerified() bool {
	return o.Verification != nil && o.State.Terminal() &&
		o.Verification.Result == o.State.Result()
}

// ReconcileReport lists exactly what one Reconcile call changed for the given
// owner. Both slices are populated (possibly empty) for deterministic output.
type ReconcileReport struct {
	TimedOut []string // IDs transitioned running -> unknown by bounded timeout
	Purged   []string // IDs removed because their record expiry passed
}

// Sentinel errors. Callers match them with errors.Is; detail is carried by
// wrapped messages that contain identifiers but never parameter bytes.
var (
	ErrInvalidRequest       = errors.New("operation: invalid request")
	ErrInvalidConfig        = errors.New("operation: invalid config")
	ErrCapacity             = errors.New("operation: capacity reached")
	ErrNotFound             = errors.New("operation: not found")
	ErrOwnershipDenied      = errors.New("operation: ownership denied")
	ErrBindingMismatch      = errors.New("operation: resource binding mismatch")
	ErrDigestMismatch       = errors.New("operation: parameter digest mismatch")
	ErrExpired              = errors.New("operation: expired")
	ErrInvalidTransition    = errors.New("operation: invalid transition")
	ErrVerificationConflict = errors.New("operation: verification conflict")
)

// Input bounds enforced at this internal trust boundary. They bound per-record
// memory so the capacity limit is a real memory bound.
const (
	MaxOwnerBytes    = 128
	MaxResourceBytes = 512
	MaxKeyBytes      = 256
	MaxParamsBytes   = 64 << 10 // 64 KiB digested per claim, never retained
	MaxSourceBytes   = 128
	MaxEvidenceBytes = 1024
)
