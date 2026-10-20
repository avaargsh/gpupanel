package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestEmbeddedAssetsMatchAuditedRepositoryFiles(t *testing.T) {
	pairs := map[string]string{
		"runtime/scripts/gpupanel-workstation.py": "../../scripts/gpupanel-workstation.py",
		"runtime/scripts/gpupanel-workspace-bundle.py": "../../scripts/gpupanel-workspace-bundle.py",
		"runtime/profiles/ubuntu24-workstation.v1.json": "../../profiles/ubuntu24-workstation.v1.json",
	}
	for embeddedName, sourcePath := range pairs {
		got, err := embeddedTools.ReadFile(embeddedName)
		if err != nil { t.Fatal(err) }
		// Go tests run with the package directory as the working directory.
		// These source paths are relative to desktop/, not the repo root.
		sourcePath = strings.TrimPrefix(sourcePath, "../")
		want, err := os.ReadFile(sourcePath)
		if err != nil { t.Fatal(err) }
		if !bytes.Equal(got, want) { t.Fatalf("stale embedded resource: %s", embeddedName) }
	}
}

func TestEmbeddedDoctorWithoutCheckoutOrDocker(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Chdir(home)
	result, err := runEmbeddedPython(25*time.Second, "gpupanel-workstation.py", "doctor")
	if err != nil { t.Fatal(err) }
	var data struct {
		Status string `json:"status"`
		Digest string `json:"profileDigest"`
		Requires map[string]bool `json:"requires"`
	}
	if err := json.Unmarshal([]byte(result), &data); err != nil { t.Fatal(err) }
	if len(data.Digest) != 64 || data.Status == "" { t.Fatalf("invalid doctor: %s", result) }
	for _, key := range []string{"docker", "core", "kubernetes"} {
		if data.Requires[key] { t.Fatalf("unexpected dependency: %s", key) }
	}
}

func TestEmbeddedProfileExportWithoutCheckout(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Chdir(home)
	dest := filepath.Join(home, "snapshot.json")
	result, err := runEmbeddedPython(25*time.Second, "gpupanel-workstation.py", "export", dest)
	if err != nil { t.Fatal(err) }
	if !strings.Contains(result, "EXPORTED") { t.Fatalf("unexpected status: %s", result) }
	info, err := os.Stat(dest)
	if err != nil { t.Fatal(err) }
	if info.Mode().Perm() != 0600 { t.Fatalf("export must be private, mode=%o", info.Mode().Perm()) }
}

func TestOnlyAllowlistedEmbeddedScripts(t *testing.T) {
	if _, err := runEmbeddedPython(time.Second, "../../bin/bash"); err == nil {
		t.Fatal("untrusted script name unexpectedly accepted")
	}
}
