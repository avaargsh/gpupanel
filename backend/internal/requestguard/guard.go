// SPDX-License-Identifier: Apache-2.0

// Package requestguard is an original, standard-library-only, Apache-2.0
// candidate for the first protected boundary slice of the future Host
// diagnosis endpoint. It is a candidate library: it wires no server, router,
// startup path or /api/v1 route and changes no existing auth API.
//
// A Guard protects one server-configured fixed target resource. It resolves
// the request through an injected, trusted session authenticator to an
// immutable Principal, enforces admin-only access to the exact target, and
// requires an injected trusted CSRF validator on every non-safe method. It
// never implements login, never mints identity, and grants no authority from
// client headers, cookies or context.
package requestguard

import (
	"context"
	"errors"
	"net/http"
	"strings"
)

const (
	maxSubjectLen  = 256
	maxResourceLen = 256
)

// Sentinel errors the injected trusted dependencies use to classify failures.
var (
	// ErrUnauthenticated means the authenticator found no valid server-side
	// session: the request is anonymous and is refused with 401.
	ErrUnauthenticated = errors.New("requestguard: no authenticated session")
	// ErrBackend means a trusted injected dependency failed operationally
	// rather than rejecting the request: it is refused with 503.
	ErrBackend = errors.New("requestguard: trusted auth dependency failure")
	// errDenied is the internal, single-collapse denial reason for 403.
	errDenied = errors.New("requestguard: principal denied")
)

// Authenticator resolves a request to an immutable Principal using an
// authoritative server-side session source. It is the only identity authority;
// it must never trust self-reported headers, cookies or tokens as identity.
type Authenticator interface {
	Authenticate(r *http.Request) (Principal, error)
}

// AuthenticatorFunc adapts a function to Authenticator.
type AuthenticatorFunc func(r *http.Request) (Principal, error)

// Authenticate implements Authenticator.
func (f AuthenticatorFunc) Authenticate(r *http.Request) (Principal, error) {
	return f(r)
}

// CSRFValidator validates a state-changing request, including a POST used for
// a read-only Host diagnosis. It must use server-side state, not a
// client-asserted flag.
type CSRFValidator interface {
	ValidateCSRF(r *http.Request) error
}

// CSRFValidatorFunc adapts a function to CSRFValidator.
type CSRFValidatorFunc func(r *http.Request) error

// ValidateCSRF implements CSRFValidator.
func (f CSRFValidatorFunc) ValidateCSRF(r *http.Request) error {
	return f(r)
}

// OriginValidator is an optional supplementary check for this endpoint only.
// It must not be used as, or weaken, the existing terminal websocket Origin
// gates; this package implements no websocket or upgrade handling.
type OriginValidator interface {
	ValidateOrigin(r *http.Request) error
}

// OriginValidatorFunc adapts a function to OriginValidator.
type OriginValidatorFunc func(r *http.Request) error

// ValidateOrigin implements OriginValidator.
func (f OriginValidatorFunc) ValidateOrigin(r *http.Request) error {
	return f(r)
}

// Config configures a Guard. TargetResource, Authenticator and CSRF are
// required; Origin is optional. There is no default identity or CSRF source.
type Config struct {
	TargetResource string
	Authenticator  Authenticator
	CSRF           CSRFValidator
	Origin         OriginValidator
}

// Guard is an immutable protected-boundary middleware. Construct it with New.
type Guard struct {
	target string
	auth   Authenticator
	csrf   CSRFValidator
	origin OriginValidator
}

// New validates configuration and returns a Guard. It fails when the fixed
// target is missing/unbounded/wildcarded or when any required trusted
// dependency is unusable, including a typed-nil pointer implementation or a
// nil function adapter. A Guard therefore can never be built without working
// authentication and CSRF enforcement, and it never panics per request because
// of a typed-nil dependency.
func New(cfg Config) (*Guard, error) {
	if err := validateTarget(cfg.TargetResource); err != nil {
		return nil, err
	}
	if isNilDependency(cfg.Authenticator) {
		return nil, errors.New("requestguard: authenticator is required")
	}
	if isNilDependency(cfg.CSRF) {
		return nil, errors.New("requestguard: CSRF validator is required")
	}
	if isNilDependency(cfg.Origin) {
		// Origin is optional: a typed-nil value is treated as absent rather
		// than stored, so it can never be invoked and panic.
		cfg.Origin = nil
	}
	return &Guard{
		target: cfg.TargetResource,
		auth:   cfg.Authenticator,
		csrf:   cfg.CSRF,
		origin: cfg.Origin,
	}, nil
}

func validateTarget(target string) error {
	if target == "" {
		return errors.New("requestguard: target resource is required")
	}
	if len(target) > maxResourceLen {
		return errors.New("requestguard: target resource is too long")
	}
	if strings.TrimSpace(target) != target {
		return errors.New("requestguard: target resource must not have surrounding whitespace")
	}
	if strings.Contains(target, "*") {
		return errors.New("requestguard: target resource must be exact, wildcards are not allowed")
	}
	return nil
}

// TargetResource returns the fixed protected resource. It is read-only.
func (g *Guard) TargetResource() string { return g.target }

// Handler wraps next with the protected boundary. A nil next falls back to
// http.NotFoundHandler so authentication and CSRF are still enforced.
func (g *Guard) Handler(next http.Handler) http.Handler {
	if next == nil {
		next = http.NotFoundHandler()
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		if ctx.Err() != nil {
			writeRefusal(w, http.StatusServiceUnavailable, msgUnavailable)
			return
		}

		principal, err := g.auth.Authenticate(r)
		if err != nil {
			status, message := authRefusal(err)
			writeRefusal(w, status, message)
			return
		}

		if err := authorizePrincipal(principal, g.target); err != nil {
			writeRefusal(w, http.StatusForbidden, msgForbidden)
			return
		}

		if ctx.Err() != nil {
			writeRefusal(w, http.StatusServiceUnavailable, msgUnavailable)
			return
		}

		if !IsSafeMethod(r.Method) {
			if err := g.csrf.ValidateCSRF(r); err != nil {
				status, message := dependencyRefusal(err)
				writeRefusal(w, status, message)
				return
			}
			if g.origin != nil {
				if err := g.origin.ValidateOrigin(r); err != nil {
					status, message := dependencyRefusal(err)
					writeRefusal(w, status, message)
					return
				}
			}
		}

		// Final check: a successful CSRF or origin callback may itself have
		// canceled the context. Never call downstream with a dead context.
		if ctx.Err() != nil {
			writeRefusal(w, http.StatusServiceUnavailable, msgUnavailable)
			return
		}

		next.ServeHTTP(w, r.WithContext(
			context.WithValue(ctx, principalKey{}, clonePrincipal(principal)),
		))
	})
}

// authRefusal classifies an authenticator error without inspecting its
// message: anonymous is 401, every other (including wrapped ErrBackend) is a
// non-diagnostic 503.
func authRefusal(err error) (int, string) {
	if errors.Is(err, ErrUnauthenticated) {
		return http.StatusUnauthorized, msgUnauthorized
	}
	return http.StatusServiceUnavailable, msgUnavailable
}

// dependencyRefusal classifies a CSRF/origin error: only the trusted ErrBackend
// sentinel (wrapped or not) is an operational failure mapping to 503; an
// ordinary rejection such as an invalid CSRF token stays 403. Both responses
// use a fixed, non-diagnostic message.
func dependencyRefusal(err error) (int, string) {
	if errors.Is(err, ErrBackend) {
		return http.StatusServiceUnavailable, msgUnavailable
	}
	return http.StatusForbidden, msgForbidden
}
