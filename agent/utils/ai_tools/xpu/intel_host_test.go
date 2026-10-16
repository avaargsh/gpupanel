package xpu

import (
	"os"
	"testing"
)

func TestIntelHostDiscovery(t *testing.T) {
	bus := os.Getenv("GPUPANEL_TEST_INTEL_PCI")
	if bus == "" {
		t.Skip("requires Intel DRM host")
	}
	available, client := New()
	if !available {
		t.Fatal("Intel DRM device present but collector unavailable")
	}
	info, err := client.LoadInfo()
	if err != nil {
		t.Fatal(err)
	}
	for _, d := range info.Devices {
		if d.Basic.PciBdfAddress == bus {
			return
		}
	}
	t.Fatal("host Intel PCI device missing")
}
