// SPDX-License-Identifier: Apache-2.0

package requestguard

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// MINOR-2: a successful CSRF callback that cancels the context must stop the
// request before downstream, with a fixed non-diagnostic 503.
func TestCancellationBySuccessfulCSRFStopsDownstream(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	csrf := CSRFValidatorFunc(func(*http.Request) error {
		cancel()
		return nil // "successful" validation that also canceled the context
	})
	guard := newGuard(t, &fakeAuth{principal: okPrincipal()}, csrf, nil)
	down := &downstream{}

	req := httptest.NewRequest(http.MethodPost, "/diagnosis", nil).WithContext(ctx)
	rec := httptest.NewRecorder()
	guard.Handler(down.handler()).ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
	if down.calls != 0 {
		t.Fatalf("downstream called %d times after CSRF canceled ctx, want 0", down.calls)
	}
	body := rec.Body.String()
	if strings.Contains(body, "context canceled") {
		t.Fatalf("response leaked cancellation detail: %q", body)
	}
	if env := decodeEnvelope(t, rec); env.Message != msgUnavailable {
		t.Fatalf("message = %q, want %q", env.Message, msgUnavailable)
	}
}

// MINOR-2: the same holds when the optional origin check cancels the context.
func TestCancellationBySuccessfulOriginStopsDownstream(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	origin := OriginValidatorFunc(func(*http.Request) error {
		cancel()
		return nil
	})
	guard := newGuard(t, &fakeAuth{principal: okPrincipal()}, &fakeCSRF{allow: true}, origin)
	down := &downstream{}

	req := httptest.NewRequest(http.MethodPost, "/diagnosis", nil).WithContext(ctx)
	rec := httptest.NewRecorder()
	guard.Handler(down.handler()).ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
	if down.calls != 0 {
		t.Fatalf("downstream called %d times after origin canceled ctx, want 0", down.calls)
	}
}
