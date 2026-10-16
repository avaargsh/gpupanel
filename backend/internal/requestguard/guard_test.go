// SPDX-License-Identifier: Apache-2.0

package requestguard

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestNewFailClosedConfig(t *testing.T) {
	auth := &fakeAuth{principal: okPrincipal()}
	csrf := &fakeCSRF{allow: true}
	cases := []struct {
		name string
		cfg  Config
	}{
		{"missing target", Config{Authenticator: auth, CSRF: csrf}},
		{"whitespace target", Config{TargetResource: " x", Authenticator: auth, CSRF: csrf}},
		{"wildcard target", Config{TargetResource: "host:*", Authenticator: auth, CSRF: csrf}},
		{"oversized target", Config{TargetResource: strings.Repeat("a", 300), Authenticator: auth, CSRF: csrf}},
		{"nil authenticator", Config{TargetResource: testTarget, CSRF: csrf}},
		{"nil csrf", Config{TargetResource: testTarget, Authenticator: auth}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if g, err := New(tc.cfg); err == nil || g != nil {
				t.Fatalf("New(%s) = (%v, %v), want construction failure", tc.name, g, err)
			}
		})
	}
}

func TestAnonymousIs401(t *testing.T) {
	auth := &fakeAuth{err: ErrUnauthenticated}
	guard := newGuard(t, auth, &fakeCSRF{allow: true}, nil)
	down := &downstream{}

	rec := httptest.NewRecorder()
	guard.Handler(down.handler()).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/diagnosis", nil))

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
	if env := decodeEnvelope(t, rec); env.Code != http.StatusUnauthorized || env.Message != msgUnauthorized {
		t.Fatalf("envelope = %+v, want code 401 message %q", env, msgUnauthorized)
	}
	if down.calls != 0 {
		t.Fatalf("downstream called %d times, want 0", down.calls)
	}
}

func TestAuthenticatorBackendFailureIs503AndRedacted(t *testing.T) {
	const secret = "session-cookie=super-secret-xyz"
	auth := &fakeAuth{err: errors.New(secret)}
	csrf := &fakeCSRF{allow: true}
	guard := newGuard(t, auth, csrf, nil)
	down := &downstream{}

	rec := httptest.NewRecorder()
	guard.Handler(down.handler()).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/diagnosis", nil))

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
	if body := rec.Body.String(); strings.Contains(body, secret) || strings.Contains(body, "super-secret") {
		t.Fatalf("response leaked upstream error detail: %q", body)
	}
	if down.calls != 0 || csrf.calls != 0 {
		t.Fatalf("downstream/csrf called on backend failure: down=%d csrf=%d", down.calls, csrf.calls)
	}
}

func TestPrincipalValidationForbidden(t *testing.T) {
	cases := []struct {
		name string
		p    Principal
	}{
		{"not authenticated", Principal{Subject: "admin-1", Resource: testTarget, Admin: true}},
		{"empty subject", Principal{Authenticated: true, Resource: testTarget, Admin: true}},
		{"oversized subject", Principal{Authenticated: true, Subject: strings.Repeat("s", 300), Resource: testTarget, Admin: true}},
		{"padded subject", Principal{Authenticated: true, Subject: " admin-1 ", Resource: testTarget, Admin: true}},
		{"control char subject", Principal{Authenticated: true, Subject: "admin\n1", Resource: testTarget, Admin: true}},
		{"empty resource", Principal{Authenticated: true, Subject: "admin-1", Admin: true}},
		{"foreign resource", Principal{Authenticated: true, Subject: "admin-1", Resource: "host:other:/diagnosis", Admin: true}},
		{"wildcard resource", Principal{Authenticated: true, Subject: "admin-1", Resource: "*", Admin: true}},
		{"nonadmin", Principal{Authenticated: true, Subject: "admin-1", Resource: testTarget}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			auth := &fakeAuth{principal: tc.p}
			guard := newGuard(t, auth, &fakeCSRF{allow: true}, nil)
			down := &downstream{}
			rec := httptest.NewRecorder()
			guard.Handler(down.handler()).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/diagnosis", nil))
			if rec.Code != http.StatusForbidden {
				t.Fatalf("status = %d, want 403", rec.Code)
			}
			if down.calls != 0 {
				t.Fatalf("downstream called %d times, want 0", down.calls)
			}
		})
	}
}

func TestCanceledContextIsRefusedWithoutWork(t *testing.T) {
	auth := &fakeAuth{principal: okPrincipal()}
	guard := newGuard(t, auth, &fakeCSRF{allow: true}, nil)
	down := &downstream{}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	req := httptest.NewRequest(http.MethodGet, "/diagnosis", nil).WithContext(ctx)

	rec := httptest.NewRecorder()
	guard.Handler(down.handler()).ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
	if auth.calls != 0 || down.calls != 0 {
		t.Fatalf("canceled request did work: auth=%d down=%d", auth.calls, down.calls)
	}
	if body := rec.Body.String(); strings.Contains(body, "context canceled") {
		t.Fatalf("response leaked cancellation detail: %q", body)
	}
}

func TestCancellationDuringAuthStopsDownstream(t *testing.T) {
	auth := &fakeAuth{principal: okPrincipal()}
	guard := newGuard(t, auth, &fakeCSRF{allow: true}, nil)
	down := &downstream{}

	ctx, cancel := context.WithCancel(context.Background())
	auth.onCall = func(*http.Request) { cancel() }
	req := httptest.NewRequest(http.MethodGet, "/diagnosis", nil).WithContext(ctx)

	rec := httptest.NewRecorder()
	guard.Handler(down.handler()).ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
	if down.calls != 0 {
		t.Fatalf("downstream called after mid-flight cancellation: %d", down.calls)
	}
}
