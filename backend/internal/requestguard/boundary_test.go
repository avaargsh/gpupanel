// SPDX-License-Identifier: Apache-2.0

package requestguard

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestIsSafeMethodClassification(t *testing.T) {
	safe := []string{http.MethodGet, http.MethodHead, http.MethodOptions}
	unsafe := []string{http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, "TRACE", "CONNECT", "PROPFIND", "get", "post", ""}
	for _, m := range safe {
		if !IsSafeMethod(m) {
			t.Errorf("IsSafeMethod(%q) = false, want true", m)
		}
	}
	for _, m := range unsafe {
		if IsSafeMethod(m) {
			t.Errorf("IsSafeMethod(%q) = true, want false (fail-closed)", m)
		}
	}
}

func TestCSRFRequiredOnEveryNonSafeMethod(t *testing.T) {
	for _, m := range []string{http.MethodGet, http.MethodHead, http.MethodOptions} {
		t.Run("safe-"+m, func(t *testing.T) {
			csrf := &fakeCSRF{allow: false}
			guard := newGuard(t, &fakeAuth{principal: okPrincipal()}, csrf, nil)
			down := &downstream{}
			rec := httptest.NewRecorder()
			guard.Handler(down.handler()).ServeHTTP(rec, httptest.NewRequest(m, "/diagnosis", nil))
			if rec.Code != http.StatusOK || down.calls != 1 {
				t.Fatalf("safe %s status=%d down=%d, want 200/1", m, rec.Code, down.calls)
			}
			if csrf.calls != 0 {
				t.Fatalf("CSRF validator called %d times on safe %s, want 0", csrf.calls, m)
			}
		})
	}
	for _, m := range []string{http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete} {
		t.Run("unsafe-"+m, func(t *testing.T) {
			auth := &fakeAuth{principal: okPrincipal()}
			csrf := &fakeCSRF{allow: true}
			guard := newGuard(t, auth, csrf, nil)
			down := &downstream{}
			rec := httptest.NewRecorder()
			guard.Handler(down.handler()).ServeHTTP(rec, httptest.NewRequest(m, "/diagnosis", nil))
			if rec.Code != http.StatusOK || down.calls != 1 {
				t.Fatalf("unsafe %q with valid CSRF status=%d down=%d, want 200/1", m, rec.Code, down.calls)
			}
			if csrf.calls != 1 {
				t.Fatalf("CSRF validator called %d times on unsafe %q, want 1", csrf.calls, m)
			}
		})
	}
}

func TestMissingOrInvalidCSRFForbidden(t *testing.T) {
	auth := &fakeAuth{principal: okPrincipal()}
	csrf := &fakeCSRF{allow: false}
	guard := newGuard(t, auth, csrf, nil)
	down := &downstream{}

	rec := httptest.NewRecorder()
	guard.Handler(down.handler()).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/diagnosis", nil))

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", rec.Code)
	}
	if down.calls != 0 {
		t.Fatalf("downstream called %d times with invalid CSRF, want 0", down.calls)
	}
	if env := decodeEnvelope(t, rec); env.Message != msgForbidden {
		t.Fatalf("message = %q, want %q", env.Message, msgForbidden)
	}
}

func TestOriginCheckAppliesOnlyToNonSafeRequests(t *testing.T) {
	// Unsafe request with invalid origin is refused.
	var originCalls int
	bad := OriginValidatorFunc(func(*http.Request) error { originCalls++; return errors.New("bad origin") })
	guard := newGuard(t, &fakeAuth{principal: okPrincipal()}, &fakeCSRF{allow: true}, bad)
	down := &downstream{}
	rec := httptest.NewRecorder()
	guard.Handler(down.handler()).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/diagnosis", nil))
	if rec.Code != http.StatusForbidden || down.calls != 0 || originCalls != 1 {
		t.Fatalf("bad origin: status=%d down=%d originCalls=%d, want 403/0/1", rec.Code, down.calls, originCalls)
	}

	// Safe request never consults the optional origin validator.
	originCalls = 0
	rec = httptest.NewRecorder()
	guard.Handler(down.handler()).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/diagnosis", nil))
	if rec.Code != http.StatusOK || originCalls != 0 {
		t.Fatalf("safe request: status=%d originCalls=%d, want 200/0", rec.Code, originCalls)
	}

	// CSRF failure must short-circuit before the optional origin check.
	originCalls = 0
	guard = newGuard(t, &fakeAuth{principal: okPrincipal()}, &fakeCSRF{allow: false}, bad)
	rec = httptest.NewRecorder()
	guard.Handler(down.handler()).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/diagnosis", nil))
	if rec.Code != http.StatusForbidden || originCalls != 0 {
		t.Fatalf("csrf-before-origin: status=%d originCalls=%d, want 403/0", rec.Code, originCalls)
	}
}
