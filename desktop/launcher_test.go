package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func fixtureLauncher(t *testing.T) (string, string) {
	t.Helper()
	home := t.TempDir()
	binary := filepath.Join(home, "GPUPanel", "desktop-preview", "bin", "gpupanel-desktop")
	if err := os.MkdirAll(filepath.Dir(binary), 0700); err != nil { t.Fatal(err) }
	if err := os.WriteFile(binary, []byte("mock"), 0755); err != nil { t.Fatal(err) }
	return home, binary
}

func TestLauncherIsUserOnlyAndRequiresDigest(t *testing.T) {
	home, binary := fixtureLauncher(t)
	review, content, err := launcherProposal(home, binary)
	if err != nil { t.Fatal(err) }
	if review.Status != "READY_FOR_APPROVAL" || len(review.PlanDigest) != 64 {
		t.Fatalf("bad preview: %+v", review)
	}
	if !strings.Contains(content, "Terminal=false") || !strings.Contains(content, "Type=Application") {
		t.Fatal("invalid Desktop entry")
	}
	if _, err = installLauncher(home, binary, "wrong"); err == nil {
		t.Fatal("must require digest approval")
	}
	if _, err := os.Stat(review.Target); !os.IsNotExist(err) {
		t.Fatal("dry run must not create file")
	}
	receipt, err := installLauncher(home, binary, review.PlanDigest)
	if err != nil || !strings.Contains(receipt, "VERIFIED") { t.Fatalf("install: %v %s", err, receipt) }
	info, err := os.Lstat(review.Target)
	if err != nil || !info.Mode().IsRegular() || info.Mode().Perm() != 0644 {
		t.Fatal("desktop entry must be regular and mode 0644")
	}
	if _, err := installLauncher(home, binary, review.PlanDigest); err == nil {
		t.Fatal("existing desktop entry may not be replaced")
	}
}

func TestLauncherRejectsSymlinkDirectoryAndBinary(t *testing.T) {
	home, binary := fixtureLauncher(t)
	victim := t.TempDir()
	link := filepath.Join(home, ".local")
	if err := os.Symlink(victim, link); err != nil { t.Fatal(err) }
	if _, err := safeLauncherDir(home); err == nil { t.Fatal("linked menu dir accepted") }
	if err := os.Remove(link); err != nil { t.Fatal(err) }
	if err := os.Remove(binary); err != nil { t.Fatal(err) }
	if err := os.Symlink("/bin/true", binary); err != nil { t.Fatal(err) }
	if _, _, err := launcherProposal(home, binary); err == nil { t.Fatal("linked binary accepted") }
}

func TestLauncherRejectsUnsafePathAndOutsideLocation(t *testing.T) {
	home, binary := fixtureLauncher(t)
	outside, _, err := launcherProposal(home, "/usr/bin/true")
	if err != nil || outside.Status != "UNSUPPORTED_LOCATION" {
		t.Fatalf("unexpected plan: %v %+v", err, outside)
	}
	for _, name := range []string{"/tmp/a%dev", "/tmp/a\"quote", "/tmp/a\\evil"} {
		if _, err := launcherContent(name); err == nil {
			t.Fatalf("unsafe Exec value accepted: %q", name)
		}
	}
	if _, _, err := launcherProposal(home, binary); err != nil { t.Fatal(err) }
}

func TestLauncherApprovalIncludesActualBinaryDigest(t *testing.T) {
	home, binary := fixtureLauncher(t)
	review, _, err := launcherProposal(home, binary)
	if err != nil || len(review.BinarySHA256) != 64 {
		t.Fatalf("binary digest was not reviewed: %+v %v", review, err)
	}
	if err := os.WriteFile(binary, []byte("replaced executable"), 0755); err != nil { t.Fatal(err) }
	changed, _, err := launcherProposal(home, binary)
	if err != nil { t.Fatal(err) }
	if changed.PlanDigest == review.PlanDigest || changed.BinarySHA256 == review.BinarySHA256 {
		t.Fatal("binary replacement did not invalidate launcher approval")
	}
	if _, err := installLauncher(home, binary, review.PlanDigest); err == nil {
		t.Fatal("stale approval allowed changed binary")
	}
	if _, err := os.Stat(review.Target); !os.IsNotExist(err) {
		t.Fatal("rejected install wrote a shortcut")
	}
	if _, err := installLauncher(home, binary, changed.PlanDigest); err != nil {
		t.Fatalf("new reviewed executable rejected: %v", err)
	}
	exists, _, err := launcherProposal(home, binary)
	if err != nil || exists.Status != "EXISTS_NO_OVERWRITE" || exists.PlanDigest != "" {
		t.Fatalf("existing shortcut should not return reusable install approval: %+v %v", exists, err)
	}
}

func TestLauncherRejectsSymlinkMenuTarget(t *testing.T) {
	home, binary := fixtureLauncher(t)
	target := filepath.Join(home, ".local", "share", "applications", launcherFile)
	if err := os.MkdirAll(filepath.Dir(target), 0700); err != nil { t.Fatal(err) }
	victim := filepath.Join(home, "victim")
	if err := os.WriteFile(victim, []byte("untouched"), 0600); err != nil { t.Fatal(err) }
	if err := os.Symlink(victim, target); err != nil { t.Fatal(err) }
	review, _, err := launcherProposal(home, binary)
	if err != nil || review.Status != "EXISTS_NO_OVERWRITE" {
		t.Fatalf("preexisting symlink not detected: %+v %v", review, err)
	}
	if _, err := installLauncher(home, binary, review.PlanDigest); err == nil {
		t.Fatal("symlinked menu entry accepted")
	}
	if got, err := os.ReadFile(victim); err != nil || string(got) != "untouched" {
		t.Fatal("shortcut install modified symlink victim")
	}
}
