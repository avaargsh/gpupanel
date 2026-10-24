package service

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
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
		svc.coreName != "gpupanel-core.service" ||
		svc.agentName != "gpupanel-agent.service" {
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

 
// Only conventional version tokens from the release channel are admitted.
// Version input is also a directory component; do not accept separators,
// traversal, shell syntax, Unicode lookalikes or unbounded lengths.
var upgradeVersionToken = regexp.MustCompile(`^v?[0-9]+(\.[0-9]+){2}(-[A-Za-z0-9]+([._-][A-Za-z0-9]+)*)?$`)

func validateUpgradeVersion(version string) error {
	if len(version) == 0 || len(version) > 96 || !upgradeVersionToken.MatchString(version) {
		return fmt.Errorf("%w: invalid upgrade release version", errUpgradeRuntimeOwnership)
	}
	return nil
}

// createUpgradeStage is create-only: never recursively remove a previous
// version directory containing a prior rollback snapshot or an in-flight
// upgrade transaction. It checks each parent with Lstat before writing.
func createUpgradeStage(installDir, version string) (string, error) {
	if err := validateUpgradeVersion(version); err != nil {
		return "", err
	}
	dir := filepath.Join(installDir, "gpupanel")
	for _, segment := range []string{"tmp", "upgrade"} {
		next := filepath.Join(dir, segment)
		stat, err := os.Lstat(next)
		if os.IsNotExist(err) {
			if err := os.Mkdir(next, 0700); err != nil {
				return "", fmt.Errorf("create upgrade staging parent: %w", err)
			}
			stat, err = os.Lstat(next)
		}
		if err != nil || !stat.IsDir() || stat.Mode()&os.ModeSymlink != 0 {
			return "", fmt.Errorf("%w: staging parent is redirected or not a directory", errUpgradeRuntimeOwnership)
		}
		dir = next
	}
	transaction := filepath.Join(dir, version)
	if err := os.Mkdir(transaction, 0700); err != nil {
		return "", fmt.Errorf("%w: upgrade stage already exists or cannot be created: %v", errUpgradeRuntimeOwnership, err)
	}
	if err := createUpgradeStageChildren(transaction, os.Mkdir, os.Remove); err != nil {
		return "", fmt.Errorf("%w: incomplete upgrade stage: %v", errUpgradeRuntimeOwnership, err)
	}
	return transaction, nil
}

// createUpgradeStageChildren creates the private staging subdirectories. If a
// child cannot be created, remove only directories created by this invocation,
// and only with os.Remove (which refuses non-empty directories). This allows a
// safe retry after ordinary partial setup failures without deleting rollback
// evidence or any data another actor may have placed in the transaction.
func createUpgradeStageChildren(
	transaction string,
	mkdir func(string, os.FileMode) error,
	remove func(string) error,
) error {
	created := make([]string, 0, 2)
	for _, child := range []string{"downloads", "original"} {
		childPath := filepath.Join(transaction, child)
		if err := mkdir(childPath, 0700); err != nil {
			for i := len(created) - 1; i >= 0; i-- {
				// Best effort only. Non-empty directories must remain intact.
				_ = remove(created[i])
			}
			// The transaction directory is removed only if now empty.
			_ = remove(transaction)
			return fmt.Errorf("create %s: %w", child, err)
		}
		created = append(created, childPath)
	}
	return nil
}

// validateUpgradeBackupPath refuses a different directory or symlinked
// rollback data supplied through persistent UpgradeLog.BackupFile. A
// successful path check alone does not authenticate snapshot contents.
func validateUpgradeBackupPath(installDir, stored string) (string, error) {
	if !filepath.IsAbs(stored) || filepath.Clean(stored) != stored {
		return "", fmt.Errorf("%w: stored backup path is not canonical", errUpgradeRuntimeOwnership)
	}
	base := filepath.Join(installDir, "gpupanel", "tmp", "upgrade")
	relative, err := filepath.Rel(base, stored)
	if err != nil || relative == "." || relative == ".." ||
		strings.HasPrefix(relative, ".."+string(filepath.Separator)) ||
		strings.Contains(relative, string(filepath.Separator)) {
		return "", fmt.Errorf("%w: backup path is outside an exact upgrade transaction", errUpgradeRuntimeOwnership)
	}
	if err := validateUpgradeVersion(relative); err != nil {
		return "", err
	}
	dir := filepath.Join(installDir, "gpupanel")
	for _, part := range []string{"tmp", "upgrade", relative, "original"} {
		dir = filepath.Join(dir, part)
		stat, err := os.Lstat(dir)
		if err != nil || !stat.IsDir() || stat.Mode()&os.ModeSymlink != 0 {
			return "", fmt.Errorf("%w: backup path is missing or redirected", errUpgradeRuntimeOwnership)
		}
	}
	return dir, nil
}
