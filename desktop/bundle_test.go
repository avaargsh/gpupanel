package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDesktopLocalBackupPathWithoutCoreOrDocker(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	path, err := backupsDir(true)
	if err != nil {
		t.Fatalf("must work offline without remote runtime: %v", err)
	}
	expected := filepath.Join(home, "GPUPanel", "backups")
	if path != expected {
		t.Fatalf("unexpected backup directory: %s", path)
	}
	info, err := os.Lstat(path)
	if err != nil || !info.IsDir() {
		t.Fatal("private backup directory absent")
	}
	if info.Mode().Perm() != 0700 {
		t.Fatalf("backup directory must be 0700, got %04o", info.Mode().Perm())
	}
	if _, err := backupsDir(false); err != nil {
		t.Fatal("existing backup directory must remain usable", err)
	}
}

func TestBackupDirRefusesSymlink(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	victim := t.TempDir()
	if err := os.Symlink(victim, filepath.Join(home, "GPUPanel")); err != nil {
		t.Fatal(err)
	}
	if _, err := backupsDir(true); err == nil {
		t.Fatal("symlink must not be used as a backup directory")
	}
}

func TestBackupDirRefusesFileCollision(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	if err := os.WriteFile(filepath.Join(home, "GPUPanel"), []byte("data"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := backupsDir(true); err == nil {
		t.Fatal("existing non-directory must not be replaced")
	}
	if content, err := os.ReadFile(filepath.Join(home, "GPUPanel")); err != nil || string(content) != "data" {
		t.Fatal("operator file modified")
	}
}

func TestBundleAndProfileInputsAreBasenamesAndDigests(t *testing.T) {
	good := "uv-python-starter-scaffold.zip"
	if !bundleFilePattern.MatchString(good) {
		t.Fatal("expected valid local bundle name")
	}
	for _, value := range []string{"../bad-scaffold.zip", "/tmp/bad-scaffold.zip", "evil.zip", "a;id-scaffold.zip", ".secret-scaffold.zip"} {
		if bundleFilePattern.MatchString(value) {
			t.Fatalf("unsafe bundle filename allowed: %s", value)
		}
	}
	if projectPattern.MatchString("../my-project") {
		t.Fatal("unsafe project name allowed")
	}
	if digestPattern.MatchString("not-a-sha256") {
		t.Fatal("invalid digest allowed")
	}
}
