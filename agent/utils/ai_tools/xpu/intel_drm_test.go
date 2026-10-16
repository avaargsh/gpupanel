package xpu

import (
	"os"
	"path/filepath"
	"testing"
)

func TestIntelDRMInventory(t *testing.T) {
	root := t.TempDir()
	add := func(card, vendor, class, bus string) {
		path := filepath.Join(root, card, "device")
		if err := os.MkdirAll(path, 0700); err != nil {
			t.Fatal(err)
		}
		for name, value := range map[string]string{"vendor": vendor, "class": class, "device": "0x7d51", "uevent": "PCI_SLOT_NAME=" + bus + "\n"} {
			if err := os.WriteFile(filepath.Join(path, name), []byte(value), 0600); err != nil {
				t.Fatal(err)
			}
		}
	}
	add("card1", "0x8086", "0x030000", "0000:00:02.0")
	add("card2", "0x8086", "0x030000", "0000:00:02.0")
	add("card1-DP-1", "0x8086", "0x030000", "0000:00:03.0")
	add("renderD128", "0x8086", "0x030000", "0000:00:04.0")
	add("card3", "0x10de", "0x030000", "0000:00:05.0")
	add("card4", "0x8086", "0x020000", "0000:00:06.0")
	add("card5", "0x8086", "0x030000", "invalid")
	add("card6", "0x8086", "0x038000", "0000:00:07.0")
	devices, err := discoverIntelDRM(root, func(string) string { return "" })
	if err != nil || len(devices) != 2 {
		t.Fatalf("inventory=%+v err=%v", devices, err)
	}
	for _, d := range devices {
		if d.Basic.DeviceName != "Intel GPU [8086:7d51]" || d.Basic.Memory != "" || d.Stats.GPUUtil != "" || d.ProcessStatus != "unavailable" {
			t.Fatalf("invented telemetry: %+v", d)
		}
	}
	devices, err = discoverIntelDRM(filepath.Join(root, "absent"), func(string) string { return "" })
	if err != nil || len(devices) != 0 {
		t.Fatalf("missing DRM: %+v %v", devices, err)
	}
}
