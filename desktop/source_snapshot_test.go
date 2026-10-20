package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestEmbeddedSourceMigrationAcrossHomes(t *testing.T) {
	first := t.TempDir()
	second := t.TempDir()
	t.Setenv("HOME", first)
	project := filepath.Join(first, "GPUPanel", "projects", "native-go")
	if err := os.MkdirAll(filepath.Join(project, "src"), 0700); err != nil { t.Fatal(err) }
	body := []byte("package main\nfunc main() {}\n")
	if err := os.WriteFile(filepath.Join(project, "src", "main.go"), body, 0600); err != nil { t.Fatal(err) }
	if err := os.WriteFile(filepath.Join(project, "README.md"), []byte("# Native\n"), 0600); err != nil { t.Fatal(err) }

	service := &DesktopService{}
	preview, err := service.SourcePlan("native-go")
	if err != nil { t.Fatal(err) }
	var plan struct { Status string `json:"status"`; Digest string `json:"manifestDigest"` }
	if err := json.Unmarshal([]byte(preview), &plan); err != nil { t.Fatal(err) }
	if plan.Status != "READY_FOR_APPROVAL" || len(plan.Digest) != 64 { t.Fatal(preview) }
	if _, err := service.SourceExport("native-go", strings.Repeat("0", 64)); err == nil {
		t.Fatal("changed snapshot approval was accepted")
	}
	backup := filepath.Join(first, "GPUPanel", "backups", "native-go-source-v1.zip")
	if _, err := os.Stat(backup); !os.IsNotExist(err) { t.Fatal("refused export wrote a ZIP") }

	res, err := service.SourceExport("native-go", plan.Digest)
	if err != nil || !strings.Contains(res, "EXPORTED") { t.Fatalf("export failed: %s %v", res, err) }
	info, err := os.Stat(backup)
	if err != nil || info.Mode().Perm() != 0600 { t.Fatal("backup must be private 0600") }
	archive, err := os.ReadFile(backup)
	if err != nil { t.Fatal(err) }
	t.Setenv("HOME", second)
	dir := filepath.Join(second, "GPUPanel", "backups")
	if err := os.MkdirAll(dir, 0700); err != nil { t.Fatal(err) }
	path := filepath.Join(dir, "native-go-source-v1.zip")
	if err := os.WriteFile(path, archive, 0600); err != nil { t.Fatal(err) }
	inspected, err := service.SourceInspect("native-go-source-v1.zip")
	if err != nil { t.Fatal(err) }
	var review struct { Status string `json:"status"`; Digest string `json:"bundleDigest"` }
	if err := json.Unmarshal([]byte(inspected), &review); err != nil { t.Fatal(err) }
	if review.Status != "READY_FOR_APPROVAL" || len(review.Digest) != 64 { t.Fatal(inspected) }
	if _, err := service.SourceRestore("native-go-source-v1.zip", strings.Repeat("0", 64)); err == nil {
		t.Fatal("restore without exact ZIP approval accepted")
	}
	restored, err := service.SourceRestore("native-go-source-v1.zip", review.Digest)
	if err != nil || !strings.Contains(restored, "VERIFIED") { t.Fatalf("restore failed: %s %v", restored, err) }
	got, err := os.ReadFile(filepath.Join(second, "GPUPanel", "projects", "native-go", "src", "main.go"))
	if err != nil || string(got) != string(body) { t.Fatal("migrated source differs") }
	if _, err := service.SourceRestore("native-go-source-v1.zip", review.Digest); err == nil {
		t.Fatal("existing source project was overwritten")
	}
}

func TestSourceSnapshotOnlyNamedLocalZip(t *testing.T) {
	service := &DesktopService{}
	if _, err := service.SourcePlan("../escape"); err == nil { t.Fatal("traversal accepted") }
	if _, err := service.SourceInspect("../private.zip"); err == nil { t.Fatal("non-local ZIP accepted") }
	if _, err := service.SourceRestore("not-source-v1.zip", "bad"); err == nil { t.Fatal("invalid approval accepted") }
	if _, err := service.SourceExport("project", "bad"); err == nil { t.Fatal("invalid SHA accepted") }
}
