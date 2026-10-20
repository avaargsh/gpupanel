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
		"runtime/scripts/gpupanel-uv-project.py": "../../scripts/gpupanel-uv-project.py",
		"runtime/scripts/gpupanel-catalog-workspace.py": "../../scripts/gpupanel-catalog-workspace.py",
		"runtime/scripts/gpupanel-catalog.py": "../../scripts/gpupanel-catalog.py",
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

func TestOfflineUvStarterPreviewWithoutRepositoryOrContainer(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Chdir(home)
	result, err := (&DesktopService{}).UvProjectPlan()
	if err != nil { t.Fatalf("local uv preview failed: %v", err) }
	var report uvProjectReceipt
	if err := json.Unmarshal([]byte(result), &report); err != nil { t.Fatal(err) }
	switch report.Status {
	case "READY_FOR_APPROVAL":
		if len(report.PlanDigest) != 64 { t.Fatal("missing project plan digest") }
	case "MISSING_UV":
		if report.Executed { t.Fatal("missing uv must not perform mutations") }
	default:
		t.Fatalf("unexpected uv plan status: %q", report.Status)
	}
	project := filepath.Join(home, "GPUPanel", "projects", "uv-python-starter")
	if _, err := os.Stat(project); !os.IsNotExist(err) {
		t.Fatal("project plan created files or directories")
	}
	if _, err := (&DesktopService{}).UvProjectCreate("wrong"); err == nil {
		t.Fatal("unapproved uv project creation was accepted")
	}
}
