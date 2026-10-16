// SPDX-License-Identifier: Apache-2.0

package requestguard

import (
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type ptrAuth struct{ p Principal }

func (a *ptrAuth) Authenticate(*http.Request) (Principal, error) { return a.p, nil }

type ptrCSRF struct{}

func (c *ptrCSRF) ValidateCSRF(*http.Request) error { return nil }

type ptrOrigin struct{}

func (o *ptrOrigin) ValidateOrigin(*http.Request) error { return nil }

// MAJOR-1: a typed-nil dependency is non-nil as an interface yet panics when
// invoked, so New must reject it instead of accepting a per-request panic.
func TestNewRejectsTypedNilRequiredDependencies(t *testing.T) {
	var nilAuth *ptrAuth
	var nilCSRF *ptrCSRF
	cases := []struct {
		name string
		cfg  Config
	}{
		{"nil pointer authenticator", Config{TargetResource: testTarget, Authenticator: nilAuth, CSRF: &ptrCSRF{}}},
		{"nil pointer csrf", Config{TargetResource: testTarget, Authenticator: &ptrAuth{p: okPrincipal()}, CSRF: nilCSRF}},
		{"nil authenticator func adapter", Config{TargetResource: testTarget, Authenticator: AuthenticatorFunc(nil), CSRF: &ptrCSRF{}}},
		{"nil csrf func adapter", Config{TargetResource: testTarget, Authenticator: &ptrAuth{p: okPrincipal()}, CSRF: CSRFValidatorFunc(nil)}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if g, err := New(tc.cfg); err == nil || g != nil {
				t.Fatalf("New(%s) = (%v, %v), want construction failure", tc.name, g, err)
			}
		})
	}
	if _, err := New(Config{TargetResource: testTarget, Authenticator: &ptrAuth{p: okPrincipal()}, CSRF: &ptrCSRF{}}); err != nil {
		t.Fatalf("New with valid pointer deps: %v", err)
	}
}

// MAJOR-1: an optional typed-nil Origin is normalized to absent, never stored,
// so it can never be invoked and panic.
func TestTypedNilOptionalOriginIsNormalizedNotPanicking(t *testing.T) {
	var nilOrigin *ptrOrigin
	origins := map[string]OriginValidator{
		"nil pointer origin": nilOrigin,
		"nil origin func":    OriginValidatorFunc(nil),
	}
	for name, origin := range origins {
		t.Run(name, func(t *testing.T) {
			guard, err := New(Config{
				TargetResource: testTarget,
				Authenticator:  &ptrAuth{p: okPrincipal()},
				CSRF:           &ptrCSRF{},
				Origin:         origin,
			})
			if err != nil {
				t.Fatalf("New: %v", err)
			}
			down := &downstream{}
			rec := httptest.NewRecorder()
			guard.Handler(down.handler()).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/diagnosis", nil))
			if rec.Code != http.StatusOK || down.calls != 1 {
				t.Fatalf("status=%d down=%d, want 200/1 (typed nil origin must not panic)", rec.Code, down.calls)
			}
		})
	}
}

// MINOR-1: only the trusted ErrBackend sentinel (wrapped or not) maps to 503;
// an ordinary CSRF rejection stays 403.
func TestCSRFErrBackendIs503OrdinaryStays403(t *testing.T) {
	cases := []struct {
		name       string
		err        error
		wantStatus int
		wantMsg    string
	}{
		{"wrapped ErrBackend", fmt.Errorf("csrf store unavailable: %w", ErrBackend), http.StatusServiceUnavailable, msgUnavailable},
		{"bare ErrBackend", ErrBackend, http.StatusServiceUnavailable, msgUnavailable},
		{"ordinary invalid", errors.New("invalid csrf token"), http.StatusForbidden, msgForbidden},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			csrf := CSRFValidatorFunc(func(*http.Request) error { return tc.err })
			guard := newGuard(t, &fakeAuth{principal: okPrincipal()}, csrf, nil)
			down := &downstream{}
			rec := httptest.NewRecorder()
			guard.Handler(down.handler()).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/diagnosis", nil))
			if rec.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tc.wantStatus)
			}
			env := decodeEnvelope(t, rec)
			if env.Code != tc.wantStatus || env.Message != tc.wantMsg {
				t.Fatalf("envelope = %+v, want code %d message %q", env, tc.wantStatus, tc.wantMsg)
			}
			if body := rec.Body.String(); strings.Contains(body, "csrf store unavailable") || strings.Contains(body, "invalid csrf token") {
				t.Fatalf("response leaked dependency detail: %q", body)
			}
			if down.calls != 0 {
				t.Fatalf("downstream called %d times, want 0", down.calls)
			}
		})
	}
}

// MINOR-1: a wrapped ErrBackend from the optional origin check also maps to 503.
func TestOriginErrBackendIs503(t *testing.T) {
	origin := OriginValidatorFunc(func(*http.Request) error { return fmt.Errorf("origin backend: %w", ErrBackend) })
	guard := newGuard(t, &fakeAuth{principal: okPrincipal()}, &fakeCSRF{allow: true}, origin)
	down := &downstream{}
	rec := httptest.NewRecorder()
	guard.Handler(down.handler()).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/diagnosis", nil))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
	if env := decodeEnvelope(t, rec); env.Message != msgUnavailable {
		t.Fatalf("message = %q, want %q", env.Message, msgUnavailable)
	}
	body := rec.Body.String()
	if strings.Contains(body, "origin backend") {
		t.Fatalf("response leaked origin detail: %q", body)
	}
	if down.calls != 0 {
		t.Fatalf("downstream called %d times, want 0", down.calls)
	}
}
