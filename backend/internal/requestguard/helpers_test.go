// SPDX-License-Identifier: Apache-2.0

package requestguard

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

const testTarget = "host:local:/diagnosis"

// fakeAuth is a synthetic authenticator. It never proves real login; it only
// exercises boundary orchestration.
type fakeAuth struct {
	principal Principal
	err       error
	calls     int
	onCall    func(*http.Request)
}

func (f *fakeAuth) Authenticate(r *http.Request) (Principal, error) {
	f.calls++
	if f.onCall != nil {
		f.onCall(r)
	}
	return f.principal, f.err
}

// fakeCSRF is a synthetic CSRF validator.
type fakeCSRF struct {
	allow bool
	calls int
}

func (f *fakeCSRF) ValidateCSRF(r *http.Request) error {
	f.calls++
	if f.allow {
		return nil
	}
	return errors.New("invalid csrf token")
}

func okPrincipal() Principal {
	return Principal{
		Authenticated: true,
		Subject:       "admin-1",
		Resource:      testTarget,
		Admin:         true,
		Claims:        map[string]string{"session": "s-1"},
	}
}

// newGuard builds a Guard with the given auth/CSRF fakes.
func newGuard(t *testing.T, auth Authenticator, csrf CSRFValidator, origin OriginValidator) *Guard {
	t.Helper()
	g, err := New(Config{TargetResource: testTarget, Authenticator: auth, CSRF: csrf, Origin: origin})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return g
}

// recorder spy for the downstream handler.
type downstream struct {
	calls     int
	principal Principal
	found     bool
	mutate    func(*Principal)
	status    int
	body      string
}

func (d *downstream) handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		d.calls++
		if p, ok := PrincipalFromContext(r.Context()); ok {
			d.principal = p
			d.found = true
			if d.mutate != nil {
				d.mutate(&p)
			}
		}
		if d.status == 0 {
			d.status = http.StatusOK
		}
		w.WriteHeader(d.status)
		_, _ = w.Write([]byte(d.body))
	})
}

func decodeEnvelope(t *testing.T, rec *httptest.ResponseRecorder) envelope {
	t.Helper()
	var env envelope
	if err := json.Unmarshal(rec.Body.Bytes(), &env); err != nil {
		t.Fatalf("body is not the controlled JSON envelope: %v (body=%q)", err, rec.Body.String())
	}
	return env
}
