package xpu

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/avaargsh/GPUPanel/agent/utils/cmd"
)

var drmCardName = regexp.MustCompile(`^card[0-9]+$`)
var pciAddress = regexp.MustCompile(`^[0-9a-fA-F]{4}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}\.[0-7]$`)

// Inventory does not require vendor tools or imply compute/telemetry readiness.
func discoverIntelDRM(root string, name func(string) string) ([]Device, error) {
	entries, err := os.ReadDir(root)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var devices []Device
	seen := map[string]bool{}
	for _, entry := range entries {
		if !drmCardName.MatchString(entry.Name()) {
			continue
		}
		path := filepath.Join(root, entry.Name(), "device")
		read := func(file string) string {
			b, _ := os.ReadFile(filepath.Join(path, file))
			return strings.TrimSpace(string(b))
		}
		if !strings.EqualFold(read("vendor"), "0x8086") || !strings.HasPrefix(read("class"), "0x03") {
			continue
		}
		bus := ""
		for _, line := range strings.Split(read("uevent"), "\n") {
			if strings.HasPrefix(line, "PCI_SLOT_NAME=") {
				bus = strings.ToLower(strings.TrimPrefix(line, "PCI_SLOT_NAME="))
			}
		}
		if !pciAddress.MatchString(bus) || seen[bus] {
			continue
		}
		seen[bus] = true
		id := strings.TrimPrefix(strings.ToLower(read("device")), "0x")
		product := name(id)
		if product == "" {
			product = "Intel GPU [8086:" + id + "]"
		}
		driver := ""
		if target, err := filepath.EvalSymlinks(filepath.Join(path, "driver")); err == nil {
			driver = filepath.Base(target)
		}
		devices = append(devices, Device{ProcessStatus: "unavailable", Basic: Basic{
			DeviceID: len(devices), DeviceName: product, VendorName: "Intel", PciBdfAddress: bus, DriverVersion: driver,
		}})
	}
	return devices, nil
}

// Read the installed PCI name database; no command execution or network required.
func intelPCIName(id string) string {
	for _, path := range []string{"/usr/share/hwdata/pci.ids", "/usr/share/misc/pci.ids"} {
		file, err := os.Open(path)
		if err != nil {
			continue
		}
		scanner := bufio.NewScanner(file)
		intel := false
		result := ""
		for scanner.Scan() {
			line := scanner.Text()
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			if line[0] != '\t' {
				intel = strings.HasPrefix(line, "8086 ")
			}
			if intel && strings.HasPrefix(line, "\t"+id+" ") {
				result = "Intel " + strings.TrimSpace(line[len(id)+1:])
				break
			}
		}
		file.Close()
		if result != "" {
			return result
		}
	}
	return ""
}

func (c Client) LoadInfoContext(ctx context.Context) (*Info, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	inventory, err := discoverIntelDRM("/sys/class/drm", intelPCIName)
	if err != nil {
		return nil, fmt.Errorf("Intel DRM discovery: %w", err)
	}
	info := &Info{Type: "xpu"}
	if cmd.Which(xpuSMICommand) {
		smi, err := c.loadSMI(ctx)
		if err != nil {
			if len(inventory) == 0 {
				return nil, err
			}
			info.Warnings = append(info.Warnings, err.Error())
		} else {
			info = smi
		}
	}
	seen := map[string]bool{}
	usedIDs := map[int]bool{}
	for _, device := range info.Devices {
		usedIDs[device.Basic.DeviceID] = true
		seen[strings.ToLower(device.Basic.PciBdfAddress)] = true
	}
	for _, device := range inventory {
		if seen[device.Basic.PciBdfAddress] {
			continue
		}
		id := 0
		for usedIDs[id] {
			id++
		}
		device.Basic.DeviceID = id
		usedIDs[id] = true
		info.Devices = append(info.Devices, device)
		info.Warnings = append(info.Warnings, fmt.Sprintf("Intel GPU %s: DRM inventory only; utilization, memory, temperature, power and processes unavailable", device.Basic.PciBdfAddress))
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return info, nil
}
