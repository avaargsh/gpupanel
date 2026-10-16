package global

import "testing"

func TestAutoProvisionPolicy(t *testing.T) {
	for _, value := range []string{"disabled", "false", "typo"} {
		t.Setenv("GPUPANEL_AUTO_PROVISION", value)
		if AutoProvisionEnabled() {
			t.Fatalf("unexpected provisioning for %q", value)
		}
	}
	for _, value := range []string{"", "enabled"} {
		t.Setenv("GPUPANEL_AUTO_PROVISION", value)
		if !AutoProvisionEnabled() {
			t.Fatalf("legacy/explicit startup disabled for %q", value)
		}
	}
}
