package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestHeadlessWorkstationCliAdmission(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Chdir(home)
	for _, input := range [][]string{
		{"--uv-tool-install=not-a-digest"},
		{"--uv-project-create=../../../tmp"},
		{"--doctor", "--uv-tool-plan"},
		{"--run", "bash"},
		{"--uv-tool-install=" + strings.Repeat("0", 64)},
		{"--uv-project-create=" + strings.Repeat("0", 64)},
		{"--open-project-terminal=../invalid"},
		{"--open-project-editor=not-created"},
	} {
		if output, err := headless(input); err == nil {
			t.Fatalf("unapproved/malformed mutation unexpectedly succeeded: %#v %s", input, output)
		}
	}
	out, err := headless([]string{"--help"})
	if err != nil || !strings.HasSuffix(out, "\n") || !strings.Contains(out, "--uv-project-plan") {
		t.Fatalf("invalid help response: %q %v", out, err)
	}
	for _, action := range []string{"--uv-tool-plan", "--uv-tool-status", "--uv-project-plan", "--uv-project-status"} {
		result, err := headless([]string{action})
		if err != nil { t.Fatalf("%s: %v", action, err) }
		var report struct{ Status string `json:"status"` }
		if err := json.Unmarshal([]byte(result), &report); err != nil || report.Status == "" {
			t.Fatalf("%s returned no structured status: %q, %v", action, result, err)
		}
	}
	if _, err := os.Stat(filepath.Join(home, "GPUPanel")); !os.IsNotExist(err) {
		t.Fatal("read-only previews or refused install created a project/tool folder")
	}
}

func TestHeadlessRefusesUnverifiedReceipts(t *testing.T) {
	for _, value := range []string{
		"", "{}", `{"status":"UNKNOWN"}`,
		`{"notStatus":"VERIFIED"}`,
		`{"status":"REFUSED_EXISTS","note":"VERIFIED"}`,
		`"VERIFIED"`,
	} {
		if isVerifiedHeadlessReceipt(value) {
			t.Fatalf("nonverified outcome accepted: %q", value)
		}
	}
	if !isVerifiedHeadlessReceipt(`{"status":"VERIFIED","executed":true}`) {
		t.Fatal("explicit VERIFIED receipt rejected")
	}
}

func TestHeadlessNativeLaunchReceiptMustBeDispatchOnly(t *testing.T) {
	for _, output := range []string{"", "{}", "not-json",
		`{"status":"OPTIONAL_APP_MISSING"}`,
		`{"status":"VERIFIED"}`,
		`{"note":"LAUNCH_REQUESTED","status":"UNKNOWN"}`,
	} {
		if _, err := headlessLaunchReceipt(output, nil); err == nil {
			t.Fatalf("incorrectly accepted native launch receipt: %q", output)
		}
	}
	valid := `{"status":"LAUNCH_REQUESTED","verifiedGUI":false}`
	if result, err := headlessLaunchReceipt(valid, nil); err != nil || result != valid {
		t.Fatalf("valid dispatch not accepted: %q %v", result, err)
	}
}
