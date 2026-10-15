package service

import "testing"

func TestLegacyRemoteCatalogCannotBeReenabled(t *testing.T) {
	if LegacyRemoteCatalogEnabled() {
		t.Fatal("GPUPanel must not synchronize the inherited remote 1Panel app catalog")
	}
}
