// SPDX-License-Identifier: Apache-2.0

package requestguard

import (
	"context"
	"strings"
	"unicode"
)

// Principal is the immutable authorization fact resolved by the injected,
// trusted session authenticator for exactly one request. A Guard copies the
// verifier's result into a private context key before calling downstream
// handlers, and downstream code only ever observes defensive copies.
//
// Only Authenticated, Subject, Resource and Admin drive authorization in this
// slice. Claims is provider-asserted metadata passed downstream; it grants no
// authority, is deep-copied on every store and read, and never appears in a
// response. This type deliberately carries no slice, so there is no slice
// aliasing to defend against.
type Principal struct {
	// Authenticated must be true, set only by the trusted authenticator after
	// it has verified a server-side session. A false value denies.
	Authenticated bool
	// Subject is the non-empty, bounded, exact authenticated identity.
	Subject string
	// Resource is the exact resource this principal is authorized for. There
	// is no wildcard and no implicit current-node fallback.
	Resource string
	// Admin must be true for the protected diagnosis target.
	Admin bool
	// Claims is copied provider metadata (for example a session label).
	Claims map[string]string
}

// principalKey is the private typed context key. Its unexported type means no
// package outside requestguard can name it; within this package the Guard
// always overwrites any pre-existing value with the verifier's result.
type principalKey struct{}

// clonePrincipal returns a deep copy; the Claims map is always rebuilt so the
// verifier's map is never aliased or mutated.
func clonePrincipal(p Principal) Principal {
	out := p
	if p.Claims != nil {
		claims := make(map[string]string, len(p.Claims))
		for k, v := range p.Claims {
			claims[k] = v
		}
		out.Claims = claims
	}
	return out
}

// PrincipalFromContext returns a defensive copy of the authorized principal
// placed by a Guard, if present. Mutating the copy never affects the stored
// value nor the authenticator's original result.
func PrincipalFromContext(ctx context.Context) (Principal, bool) {
	if ctx == nil {
		return Principal{}, false
	}
	p, ok := ctx.Value(principalKey{}).(Principal)
	if !ok {
		return Principal{}, false
	}
	return clonePrincipal(p), true
}

// authorizePrincipal enforces the fixed-target, admin-only contract. Every
// failure collapses to a single unexported denial so the caller cannot leak
// which specific check failed.
func authorizePrincipal(p Principal, target string) error {
	if !p.Authenticated {
		return errDenied
	}
	if !validSubject(p.Subject) {
		return errDenied
	}
	if target == "" || p.Resource != target {
		return errDenied
	}
	if !p.Admin {
		return errDenied
	}
	return nil
}

// validSubject requires an exact, non-empty, bounded identity with no
// surrounding whitespace and no control characters (which could smuggle or
// corrupt downstream identity handling).
func validSubject(s string) bool {
	if s == "" || len(s) > maxSubjectLen {
		return false
	}
	if s != strings.TrimSpace(s) {
		return false
	}
	return strings.IndexFunc(s, unicode.IsControl) < 0
}
