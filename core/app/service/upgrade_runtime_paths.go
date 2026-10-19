package service

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

var errUpgradeRuntimeOwnership = errors.New("GPUPanel in-app upgrade refused: installed runtime identity is not verified")

// upgradeRuntimePaths binds the in-app upgrader to the *real*, non-symlinked
// service executables. The installer uses /opt/gpupanel/gpupanel-{core,agent};
// /usr/local/bin/gpupanel-* are compatibility links which must NEVER be
// replaced by CopyFileWithRename (cp to .tmp + mv replaces the link itself).
//
// This deliberately supports only the installed Ubuntu/systemd M0 pilot.
// Other service managers/custom base dirs fail BEFORE the download/backup
// transaction until their actual service unit ownership is tested.
func upgradeRuntimePaths(installDir string, svc serviceInfo) (string, string, error) {
	return validateOwnedUpgradePaths(installDir, svc, "/opt", "/etc/systemd/system")
}

// validateOwnedUpgradePaths has injectable expected paths solely to test
// refusal/selection against disposable fixture files, without changing /opt.
func validateOwnedUpgradePaths(installDir string, svc serviceInfo, expectedBase, expectedUnits string) (string, string, error) {
	deny := func(detail string) (string, string, error) {
		return "", "", fmt.Errorf("%w: %s", errUpgradeRuntimeOwnership, detail)
	}
	if installDir != expectedBase ||
		filepath.Clean(installDir) != installDir ||
		filepath.Clean(svc.basePath) != expectedUnits ||
		!strings.HasSuffix(svc.coreName, ".service") ||
		!strings.HasSuffix(svc.agentName, ".service") {
		return deny("service manager or installation base differs from the reviewed systemd installation")
	}
	root := filepath.Join(installDir, "gpupanel")
	actualRoot, err := filepath.EvalSymlinks(root)
	if err != nil || actualRoot != root {
		return deny("installed runtime path is missing or redirected")
	}
	stat, err := os.Lstat(root)
	if err != nil || !stat.IsDir() {
		return deny("installed GPUPanel directory is not a normal directory")
	}
	bins := []string{filepath.Join(root, "gpupanel-core"), filepath.Join(root, "gpupanel-agent")}
	units := []string{
		filepath.Join(svc.basePath, svc.coreName),
		filepath.Join(svc.basePath, svc.agentName),
	}
	for i, bin := range bins {
		meta, err := os.Lstat(bin)
		if err != nil || !meta.Mode().IsRegular() || meta.Mode().Perm()&0111 == 0 {
			return deny("installed service binary is missing, symlinked or not executable")
		}
		unit, err := os.Lstat(units[i])
		if err != nil || !unit.Mode().IsRegular() {
			return deny("installed systemd unit is missing or redirected")
		}
		raw, err := os.ReadFile(units[i])
		if err != nil {
			return deny("installed systemd unit is unreadable")
		}
		starts, working := 0, 0
		for _, line := range strings.Split(string(raw), "\n") {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "ExecStart=") {
				starts++
				if line != "ExecStart="+bin {
					return deny("systemd ExecStart does not point to the owned runtime binary")
				}
			}
			if strings.HasPrefix(line, "WorkingDirectory=") {
				working++
				if line != "WorkingDirectory="+root {
					return deny("systemd working directory differs from the owned installation")
				}
			}
		}
		if starts != 1 || working != 1 {
			return deny("systemd runtime ownership is ambiguous")
		}
	}
	return bins[0], bins[1], nil
}
