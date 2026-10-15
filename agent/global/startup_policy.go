package global

import "os"

// Existing installs retain startup provisioning unless the operator disables it.
// Unknown values fail closed. Explicit API operations are unaffected.
func AutoProvisionEnabled() bool {
	value := os.Getenv("GPUPANEL_AUTO_PROVISION")
	return value == "" || value == "enabled"
}
