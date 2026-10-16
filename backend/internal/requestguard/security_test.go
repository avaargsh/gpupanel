// SPDX-License-Identifier: Apache-2.0

package requestguard

import (
	"context"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

// tamper adds every self-reported identity/authority header this slice must
// ignore: local token, API_AUTH flag, browser approval, owner/role/subject.
func tamper(req *http.Request) *http.Request {
	req.Header.Set("X-Panel-Local-Token", "forged-local-token")
	req.Header.Set("API_AUTH", "true")
	req.Header.Set("X-Subject", "evil")
	req.Header.Set("X-Role", "admin")
	req.Header.Set("X-Owner", "evil")
	req.Header.Set("X-User-Approved", "true")
	req.AddCookie(&http.Cookie{Name: "user_approved", Value: "true"})
	return req
}

func TestSelfReportedHeadersGrantNoAuthority(t *testing.T) {
	auth := &fakeAuth{err: ErrUnauthenticated} // authoritative provider: anonymous
	guard := newGuard(t, auth, &fakeCSRF{allow: true}, nil)
	down := &downstream{}

	rec := httptest.NewRecorder()
	req := tamper(httptest.NewRequest(http.MethodPost, "/diagnosis", nil))
	guard.Handler(down.handler()).ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401 despite tampered authority headers", rec.Code)
	}
	if down.calls != 0 {
		t.Fatalf("downstream called %d times, want 0", down.calls)
	}
}

func TestTamperedHeadersCannotOverrideSessionIdentity(t *testing.T) {
	auth := &fakeAuth{onCall: func(r *http.Request) {
		// Provider trusts only the authoritative server-side session cookie.
		c, err := r.Cookie("session")
		if err != nil {
			t.Fatal("fake authenticator expected session cookie")
		}
		_ = c
	}}
	auth.principal = okPrincipal()
	guard := newGuard(t, auth, &fakeCSRF{allow: true}, nil)
	down := &downstream{}

	rec := httptest.NewRecorder()
	req := tamper(httptest.NewRequest(http.MethodPost, "/diagnosis", nil))
	req.AddCookie(&http.Cookie{Name: "session", Value: "s-1"})
	guard.Handler(down.handler()).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK || down.calls != 1 {
		t.Fatalf("status=%d down=%d, want 200/1", rec.Code, down.calls)
	}
	if down.principal.Subject != "admin-1" {
		t.Fatalf("subject = %q, want provider value admin-1 (header must not win)", down.principal.Subject)
	}
}

func TestCallerSuppliedContextIdentityCannotOverrideVerifier(t *testing.T) {
	attacker := Principal{Authenticated: true, Subject: "evil", Resource: testTarget, Admin: true}
	guard := newGuard(t, &fakeAuth{principal: okPrincipal()}, &fakeCSRF{allow: true}, nil)
	down := &downstream{}

	req := httptest.NewRequest(http.MethodGet, "/diagnosis", nil).
		WithContext(context.WithValue(context.Background(), principalKey{}, attacker))

	rec := httptest.NewRecorder()
	guard.Handler(down.handler()).ServeHTTP(rec, req)

	if !down.found || down.principal.Subject != "admin-1" {
		t.Fatalf("downstream principal = %+v, want verifier result admin-1", down.principal)
	}
}

func TestValidRequestSingleDownstreamCallNoLeaks(t *testing.T) {
	auth := &fakeAuth{principal: okPrincipal()}
	csrf := &fakeCSRF{allow: true}
	guard := newGuard(t, auth, csrf, nil)
	down := &downstream{body: "diagnosis-ok"}

	rec := httptest.NewRecorder()
	guard.Handler(down.handler()).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/diagnosis", nil))

	if down.calls != 1 || auth.calls != 1 || csrf.calls != 1 {
		t.Fatalf("calls auth=%d csrf=%d down=%d, want 1/1/1", auth.calls, csrf.calls, down.calls)
	}
	if down.principal.Resource != testTarget || !down.principal.Admin || !down.principal.Authenticated {
		t.Fatalf("downstream principal = %+v, want authorized target principal", down.principal)
	}
	for _, h := range []string{"Set-Cookie", "Authorization", "X-Auth-Token"} {
		if v := rec.Header().Get(h); v != "" {
			t.Fatalf("response set %s = %q, want none", h, v)
		}
	}
}

func TestPrincipalImmutabilityAndCopyOnRead(t *testing.T) {
	returned := okPrincipal()
	auth := &fakeAuth{principal: returned}
	guard := newGuard(t, auth, &fakeCSRF{allow: true}, nil)

	snapshot := clonePrincipal(returned)
	var first, second Principal
	var firstFound, secondFound bool
	down := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p, _ := PrincipalFromContext(r.Context())
		p.Claims["session"] = "mutated"
		first, firstFound = PrincipalFromContext(r.Context())
		second, secondFound = PrincipalFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	rec := httptest.NewRecorder()
	guard.Handler(down).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/diagnosis", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if !reflect.DeepEqual(returned, snapshot) {
		t.Fatalf("authenticator-returned principal was mutated: got %+v want %+v", returned, snapshot)
	}
	if !firstFound || !secondFound {
		t.Fatal("principal missing from context")
	}
	if first.Claims["session"] != "s-1" || second.Claims["session"] != "s-1" {
		t.Fatalf("downstream mutation leaked into stored principal: first=%v second=%v", first.Claims, second.Claims)
	}
	if reflect.ValueOf(first.Claims).Pointer() == reflect.ValueOf(second.Claims).Pointer() {
		t.Fatal("PrincipalFromContext returned aliased claims maps, want distinct copies")
	}
}
