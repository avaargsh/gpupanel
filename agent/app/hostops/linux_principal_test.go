package hostops

import (
	"os"
	"testing"
)

func eligibleFacts() principalFacts {
	return principalFacts{
		UID: 1001, Username: "dev_01", Home: "/home/dev_01",
		HomeUID: 1001, HomeMode: os.ModeDir | 0o700, HomeIsDir: true,
		ParentUID: 0, ParentMode: os.ModeDir | 0o755, ParentIsDir: true,
		Runtime: "/run/user/1001", RuntimeUID: 1001,
		RuntimeMode: os.ModeDir | 0o700, RuntimeIsDir: true,
	}
}

func TestLinuxPrincipalCandidateNeverConfersExecution(t *testing.T) {
	got := assessLinuxPrincipal(eligibleFacts())
	if got.UID != 1001 || got.State != "CandidateUnbound" ||
		!got.RequirementsMet || got.ExecutionAuthorized ||
		got.Blocker != "CoreOSPrincipalBindingRequired" {
		t.Fatalf("valid local Linux user was promoted to execution grant: %+v", got)
	}
}

func TestLinuxPrincipalFailClosedCases(t *testing.T) {
	cases := []struct {
		name, reason string
		mutate func(*principalFacts)
	}{
		{"root", "NonLocalPrincipal", func(f *principalFacts) { f.UID = 0 }},
		{"service-uid", "NonLocalPrincipal", func(f *principalFacts) { f.UID = 999 }},
		{"bad-username", "NonLocalPrincipal", func(f *principalFacts) { f.Username = "../bad" }},
		{"foreign-home", "UnsafeHome", func(f *principalFacts) { f.Home = "/tmp/dev_01" }},
		{"home-symlink", "UnsafeHome", func(f *principalFacts) { f.HomeIsSymlink = true }},
		{"home-other-uid", "UnsafeHome", func(f *principalFacts) { f.HomeUID = 1010 }},
		{"home-world-writable", "UnsafeHome", func(f *principalFacts) { f.HomeMode = os.ModeDir | 0o777 }},
		{"home-missing", "UnsafeHome", func(f *principalFacts) { f.HomeIsDir = false }},
		{"parent-symlink", "UnsafeHomeParent", func(f *principalFacts) { f.ParentIsLink = true }},
		{"parent-other-owner", "UnsafeHomeParent", func(f *principalFacts) { f.ParentUID = 1001 }},
		{"parent-writable", "UnsafeHomeParent", func(f *principalFacts) { f.ParentMode = os.ModeDir | 0o777 }},
		{"missing-runtime", "UserSessionUnavailable", func(f *principalFacts) { f.RuntimeIsDir = false }},
		{"runtime-symlink", "UserSessionUnavailable", func(f *principalFacts) { f.RuntimeIsLink = true }},
		{"runtime-other-owner", "UserSessionUnavailable", func(f *principalFacts) { f.RuntimeUID = 1002 }},
		{"runtime-not-private", "UserSessionUnavailable", func(f *principalFacts) { f.RuntimeMode = os.ModeDir | 0o755 }},
		{"wrong-runtime", "UserSessionUnavailable", func(f *principalFacts) { f.Runtime = "/run/user/1002" }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := eligibleFacts()
			tc.mutate(&f)
			got := assessLinuxPrincipal(f)
			if got.State != "CandidateRejected" || got.Blocker != tc.reason ||
				got.ExecutionAuthorized || got.RequirementsMet {
				t.Fatalf("failed close check: %+v", got)
			}
		})
	}
}

func TestLinuxPrincipalReadOnlyLookupRejectsRootAndInvalidRange(t *testing.T) {
	for _, uid := range []int64{-1, 0, 500, 999, 60001} {
		got := InspectLinuxPrincipal(uid)
		if got.ExecutionAuthorized || got.State != "CandidateRejected" ||
			got.Blocker != "NonLocalPrincipal" {
			t.Fatalf("invalid UID unexpectedly eligible: %+v", got)
		}
	}
}
