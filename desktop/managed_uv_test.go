package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestManagedUvUserLocalReceiptAndPath(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("PATH", "/usr/bin")
	root := filepath.Join(home, "GPUPanel", "tools", "uv", trustedUvVersion)
	if err := os.MkdirAll(filepath.Join(root, "bin"), 0700); err != nil { t.Fatal(err) }
	program := filepath.Join(root, "bin", "uv")
	body := []byte("test ELF executable only; never run")
	if err := os.WriteFile(program, body, 0700); err != nil { t.Fatal(err) }
	sum := sha256.Sum256(body)
	receipt := managedUvReceipt{
		Version: trustedUvVersion,
		Asset: trustedUvAsset,
		ArchiveSHA256: trustedUvArchiveSHA,
		BinarySHA256: hex.EncodeToString(sum[:]),
	}
	data, _ := json.Marshal(receipt)
	if err := os.WriteFile(filepath.Join(root, "receipt.json"), data, 0600); err != nil { t.Fatal(err) }
	dir, valid := verifiedManagedUvBinWithExpectedDigest(home, receipt.BinarySHA256)
	if !valid || dir != filepath.Join(root, "bin") {
		t.Fatal("hermetic receipt verification rejected")
	}
	// The binary/receipt pair can be forged by the local user. Production
	// admission MUST reject it unless the ELF equals the reviewed official sha.
	if _, valid := verifiedManagedUvBin(home); valid {
		t.Fatal("forged self-consistent binary and receipt were trusted")
	}
	for _, part := range embeddedPythonEnv() {
		if strings.HasPrefix(part, "PATH=") && strings.Contains(part, filepath.Join(root, "bin")) {
			t.Fatal("forged uv must not appear in subprocess PATH")
		}
	}
	if err := os.WriteFile(program, []byte("tampered"), 0700); err != nil { t.Fatal(err) }
	if _, valid := verifiedManagedUvBinWithExpectedDigest(home, receipt.BinarySHA256); valid { t.Fatal("tampered uv binary trusted") }
	for _, part := range embeddedPythonEnv() {
		if strings.HasPrefix(part, "PATH=") && strings.Contains(part, filepath.Join(root, "bin")) {
			t.Fatal("tampered uv must not override PATH")
		}
	}
}

func TestManagedUvRejectsSymlinkedVersion(t *testing.T) {
	home := t.TempDir()
	base := filepath.Join(home, "GPUPanel", "tools", "uv")
	if err := os.MkdirAll(base, 0700); err != nil { t.Fatal(err) }
	if err := os.Symlink(t.TempDir(), filepath.Join(base, trustedUvVersion)); err != nil { t.Fatal(err) }
	if _, valid := verifiedManagedUvBin(home); valid { t.Fatal("version symlink trusted") }
}

func TestOfflineUvToolMissingArchiveReturnsReviewOnly(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	output, err := (&DesktopService{}).UvToolPlan()
	if err != nil { t.Fatal(err) }
	if !strings.Contains(output, "MISSING_ARCHIVE") && !strings.Contains(output, "UNSUPPORTED_OS") {
		t.Fatalf("expected missing file or non-Ubuntu refusal: %s", output)
	}
	if _, err := (&DesktopService{}).UvToolInstall("invalid"); err == nil {
		t.Fatal("missing digest unexpectedly approved")
	}
	if _, err := os.Stat(filepath.Join(home, "GPUPanel")); !os.IsNotExist(err) {
		t.Fatal("read-only tool plan created user directories")
	}
}
