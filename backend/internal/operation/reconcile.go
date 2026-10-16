// SPDX-License-Identifier: Apache-2.0

package operation

import (
	"context"
	"fmt"
	"sort"
)

// Reconcile is the only method that applies clock-driven changes, and it is
// strictly scoped to records of the given owner. For each owned record, in
// creation order:
//
//  1. running and past Deadline -> unknown (recorded in report.TimedOut); a
//     late terminal report on that record is henceforth ErrInvalidTransition,
//     and Claim replay of it is refused (DECISIONS.md D1).
//  2. not running and past its retention (ExpiresAt, extended for terminal
//     outcomes by the observation window) -> removed (report.Purged), which
//     releases its (owner, key) identity.
//
// A running record is never purged before step 1 can fire, and an unknown
// outcome stays queryable for the bounded observation window after the
// timeout before its record becomes reclaimable. Reconcile spawns nothing:
// callers drive it explicitly, and the reclamation owner for each principal's
// store is that principal's authenticated backend lifecycle (DECISIONS.md
// D2) — no cross-owner sweep exists here. Queries (Get/List) never
// reconcile, so a query can neither transition nor execute anything.
func (s *Store) Reconcile(ctx context.Context, owner Owner) (ReconcileReport, error) {
	report := ReconcileReport{TimedOut: []string{}, Purged: []string{}}
	if err := ctx.Err(); err != nil {
		return report, err
	}
	if owner == "" {
		return report, fmt.Errorf("%w: owner is required", ErrInvalidRequest)
	}
	if len(owner) > MaxOwnerBytes {
		return report, fmt.Errorf("%w: owner exceeds %d bytes", ErrInvalidRequest, MaxOwnerBytes)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	now := s.clock.Now()
	owned := make([]*record, 0, len(s.byID))
	for _, rec := range s.byID {
		if rec.owner == owner {
			owned = append(owned, rec)
		}
	}
	sort.Slice(owned, func(i, j int) bool { return owned[i].seq < owned[j].seq })

	for _, rec := range owned {
		if rec.state == StateRunning && !now.Before(rec.deadline) {
			rec.state = StateUnknown
			rec.endedAt = now
			report.TimedOut = append(report.TimedOut, rec.id)
			continue
		}
		if rec.dead(now, s.window) {
			delete(s.byID, rec.id)
			delete(s.byOwnerKey, ownerKey{owner: rec.owner, key: rec.key})
			report.Purged = append(report.Purged, rec.id)
		}
	}
	return report, nil
}

// Verify records an independently observed outcome against a terminal
// operation. The lifecycle state is never rewritten by a verification: the
// observation and the state remain two distinct facts (see
// Operation.IndependentlyVerified).
//
// Verification is allowed only on completed/failed/unknown records; on other
// states it is ErrInvalidTransition. The first verification wins; repeating an
// identical observation is an idempotent replay, while a different
// observation of the same record is ErrVerificationConflict.
func (s *Store) Verify(ctx context.Context, owner Owner, id string, v Verification) (Operation, error) {
	if err := ctx.Err(); err != nil {
		return Operation{}, err
	}
	if err := validateVerification(v); err != nil {
		return Operation{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	rec, err := s.lookupLocked(owner, id)
	if err != nil {
		return Operation{}, err
	}
	if !rec.state.Terminal() {
		return Operation{}, fmt.Errorf("%w: Verify requires a terminal state, %s is %s", ErrInvalidTransition, rec.id, rec.state)
	}
	if rec.verification != nil {
		if sameVerification(*rec.verification, v) {
			return snapshot(rec), nil
		}
		return Operation{}, fmt.Errorf("%w: %s already verified by %s", ErrVerificationConflict, rec.id, rec.verification.Source)
	}
	rec.verification = &Verification{
		Source:   v.Source,
		Result:   v.Result,
		Evidence: v.Evidence,
		At:       s.clock.Now(),
	}
	return snapshot(rec), nil
}

func validateVerification(v Verification) error {
	if v.Source == "" {
		return fmt.Errorf("%w: verification source is required", ErrInvalidRequest)
	}
	if len(v.Source) > MaxSourceBytes {
		return fmt.Errorf("%w: verification source exceeds %d bytes", ErrInvalidRequest, MaxSourceBytes)
	}
	if !v.Result.Valid() {
		return fmt.Errorf("%w: unknown verification result %q", ErrInvalidRequest, v.Result)
	}
	if len(v.Evidence) > MaxEvidenceBytes {
		return fmt.Errorf("%w: verification evidence exceeds %d bytes", ErrInvalidRequest, MaxEvidenceBytes)
	}
	return nil
}

// sameVerification compares observations ignoring the store-assigned timestamp.
func sameVerification(stored, incoming Verification) bool {
	return stored.Source == incoming.Source &&
		stored.Result == incoming.Result &&
		stored.Evidence == incoming.Evidence
}
