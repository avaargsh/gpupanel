package main

import (
	"errors"
	"strings"
	"testing"
)

func TestPolkitConcurrentAuthorizationIsDenied(t *testing.T) {
	s := &DesktopService{}
	if !s.claimInstallSlot() { t.Fatal("first authorization slot unavailable") }
	if s.claimInstallSlot() { t.Fatal("concurrent Polkit request entered apt slot") }
	// Even a syntactically approved digest must not execute in parallel.
	_, err := s.InstallPackages(strings.Repeat("a", 64))
	if err == nil || !strings.Contains(err.Error(), "禁止并发") {
		t.Fatalf("concurrent request not rejected: %v", err)
	}
	s.releaseInstallSlot()
	if !s.claimInstallSlot() { t.Fatal("slot should be available after completion") }
	s.releaseInstallSlot()
}

func TestPolkitNormalizedReceipts(t *testing.T) {
	for _, tc := range []struct {
		name string
		json string
		err error
		allow bool
	}{
		{"cancel", `{"status":"AUTH_CANCELLED","executed":false,"reconciliationRequired":false}`, errors.New("exit 2"), true},
		{"denied", `{"status":"AUTH_NOT_GRANTED","executed":false,"reconciliationRequired":false}`, errors.New("exit 2"), true},
		{"no agent", `{"status":"POLKIT_UNAVAILABLE","executed":false}`, errors.New("exit 2"), true},
		{"bad digest", `{"status":"REFUSED_PLAN_MISMATCH","executed":false}`, errors.New("exit 2"), true},
		{"apt partial", `{"status":"UNKNOWN","executed":true,"reconciliationRequired":true}`, errors.New("exit 2"), true},
		{"apt verified", `{"status":"VERIFIED","executed":true,"reconciliationRequired":false}`, nil, true},
		{"false success on failed process", `{"status":"VERIFIED","executed":true,"reconciliationRequired":false}`, errors.New("exit 2"), false},
		{"success without observation", `{"status":"VERIFIED","executed":true}`, nil, false},
		{"unknown but no reconciliation", `{"status":"UNKNOWN","executed":true,"reconciliationRequired":false}`, errors.New("exit 2"), false},
		{"denied but executed", `{"status":"AUTH_CANCELLED","executed":true}`, nil, false},
		{"string instead of flag", `{"status":"VERIFIED","executed":"true"}`, nil, false},
		{"unrecognized", `{"status":"APPROVAL_REQUIRED","executed":false}`, nil, false},
		{"malformed", "not-json", errors.New("exit 2"), false},
		{"empty", "", nil, false},
	} {
		t.Run(tc.name,func(t *testing.T) {
			output,err:=normalizeAptReceipt(tc.json,tc.err)
			if (err==nil)!=tc.allow {t.Fatalf("accepted=%t want=%t: %v",err==nil,tc.allow,err)}
			if tc.allow && output!=tc.json {t.Fatalf("lost structured receipt: %s",output)}
			if !tc.allow && strings.Contains(output,"VERIFIED") {t.Fatal("unverified receipt leaked")}
		})
	}
}
