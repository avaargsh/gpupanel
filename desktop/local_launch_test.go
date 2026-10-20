package main

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func localLaunchFixture(t *testing.T) (string, string) {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	project := filepath.Join(home, "GPUPanel", "projects", "uv-python-starter")
	if err := os.MkdirAll(project, 0700); err != nil { t.Fatal(err) }
	return home, project
}

func TestLocalProjectNativeLaunchNeverUsesShellOrContainer(t *testing.T) {
	_, target := localLaunchFixture(t)
	type invocation struct { name string; args []string }
	calls := []invocation{}
	finder := func(name string) (string, error) {
		switch name {
		case "gnome-terminal": return "/usr/bin/gnome-terminal", nil
		case "code": return "/usr/bin/code", nil
		default: return "", errors.New("missing")
		}
	}
	starter := func(name string, args ...string) error {
		calls = append(calls, invocation{name, append([]string(nil), args...)})
		return nil
	}
	gotTerminal, err := startLocalProjectApp("terminal", "uv-python-starter", finder, starter)
	if err != nil || !strings.Contains(gotTerminal, "LAUNCH_REQUESTED") {
		t.Fatalf("terminal result: %s %v", gotTerminal, err)
	}
	gotEditor, err := startLocalProjectApp("editor", "uv-python-starter", finder, starter)
	if err != nil || !strings.Contains(gotEditor, "verifiedGUI\":false") {
		t.Fatalf("editor result: %s %v", gotEditor, err)
	}
	want := []invocation{
		{"/usr/bin/gnome-terminal", []string{"--working-directory=" + target}},
		{"/usr/bin/code", []string{"--new-window", target}},
	}
	if !reflect.DeepEqual(calls, want) {
		t.Fatalf("only fixed argv allowed\ngot: %#v\nwant: %#v", calls, want)
	}
	if !strings.Contains(gotTerminal, "\"docker\":false") ||
		!strings.Contains(gotEditor, "\"core\":false") {
		t.Fatal("native launch must never require Docker or remote Core")
	}
}

func TestLocalProjectRefusesTraversalAndSymlinks(t *testing.T) {
	home, _ := localLaunchFixture(t)
	for _, name := range []string{"../outside", "/tmp", "bad;touch", "with space", ".hidden", ""} {
		if _, err := localProjectDir(home, name); err == nil {
			t.Fatalf("unsafe project accepted: %q", name)
		}
	}
	external := t.TempDir()
	if err := os.Symlink(external, filepath.Join(home, "GPUPanel", "projects", "linked")); err != nil { t.Fatal(err) }
	if _, err := localProjectDir(home, "linked"); err == nil { t.Fatal("symlink target accepted") }
	if _, err := localProjectDir(home, "not-created"); err == nil { t.Fatal("missing project accepted") }
	if err := os.Rename(filepath.Join(home, "GPUPanel", "projects"),
		filepath.Join(home, "GPUPanel", "original-projects")); err != nil { t.Fatal(err) }
	if err := os.Symlink(external, filepath.Join(home, "GPUPanel", "projects")); err != nil { t.Fatal(err) }
	if _, err := localProjectDir(home, "uv-python-starter"); err == nil { t.Fatal("symlinked parent accepted") }
}

func TestOptionalAppsDoNotBlockLocalWorkstation(t *testing.T) {
	_, _ = localLaunchFixture(t)
	started := false
	missing := func(string) (string, error) { return "", os.ErrNotExist }
	start := func(string, ...string) error { started = true; return nil }
	output, err := startLocalProjectApp("editor", "uv-python-starter", missing, start)
	if err != nil || started || !strings.Contains(output, "OPTIONAL_APP_MISSING") {
		t.Fatalf("optional editor should be non-blocking: %q %v", output, err)
	}
	if _, err := startLocalProjectApp("arbitrary", "uv-python-starter", missing, start); err == nil {
		t.Fatal("arbitrary executable kind accepted")
	}
}

func TestNativeStartFailureDoesNotClaimSuccess(t *testing.T) {
	_, _ = localLaunchFixture(t)
	finder := func(string) (string, error) { return "/usr/bin/code", nil }
	failed := func(string, ...string) error { return errors.New("process denied") }
	if output, err := startLocalProjectApp("editor", "uv-python-starter", finder, failed); err == nil || output != "" {
		t.Fatal("failed start must not emit LAUNCH_REQUESTED")
	}
}
