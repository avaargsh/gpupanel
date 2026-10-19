package service

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// verifyUpgradeBackupInventory is a bounded structural and digest check of
// the files the in-app rollback will actually read. It must pass BEFORE any
// running executable is replaced. This does NOT certify a transactionally
// consistent SQLite backup: database restore remains a separate G3 blocker.
func verifyUpgradeBackupInventory(originalDir string, svc serviceInfo) error {
	if err := regularUpgradeBackupDir(originalDir); err != nil {
		return fmt.Errorf("rollback snapshot root: %w", err)
	}
	for _, name := range []string{"db", "lang"} {
		if err := regularUpgradeBackupDir(filepath.Join(originalDir, name)); err != nil {
			return fmt.Errorf("rollback %s directory: %w", name, err)
		}
	}
	if err := verifyUpgradeDBInventory(filepath.Join(filepath.Dir(svc.coreBinary), "db"),
		filepath.Join(originalDir, "db")); err != nil {
		return fmt.Errorf("database snapshot inventory: %w", err)
	}
	pairs := [][2]string{
		{svc.coreBinary, filepath.Join(originalDir, "gpupanel-core")},
		{svc.agentBinary, filepath.Join(originalDir, "gpupanel-agent")},
		{filepath.Join(svc.basePath, svc.coreName), filepath.Join(originalDir, svc.coreName)},
		{filepath.Join(svc.basePath, svc.agentName), filepath.Join(originalDir, svc.agentName)},
		{filepath.Join(filepath.Dir(svc.coreBinary), "geo", "GeoIP.mmdb"),
			filepath.Join(originalDir, "GeoIP.mmdb")},
	}
	for _, pair := range pairs {
		expected, err := regularUpgradeFileHash(pair[0])
		if err != nil {
			return fmt.Errorf("installed source %s: %w", filepath.Base(pair[0]), err)
		}
		actual, err := regularUpgradeFileHash(pair[1])
		if err != nil {
			return fmt.Errorf("rollback snapshot %s: %w", filepath.Base(pair[1]), err)
		}
		if actual != expected {
			return fmt.Errorf("rollback snapshot mismatch: %s", filepath.Base(pair[1]))
		}
	}
	return nil
}

func regularUpgradeBackupDir(path string) error {
	info, err := os.Lstat(path)
	if err != nil { return err }
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return errUpgradeRuntimeOwnership
	}
	return nil
}

func regularUpgradeFileHash(path string) ([32]byte, error) {
	var empty [32]byte
	info, err := os.Lstat(path)
	if err != nil { return empty, err }
	if !info.Mode().IsRegular() || info.Size() == 0 {
		return empty, errUpgradeRuntimeOwnership
	}
	f, err := os.Open(path)
	if err != nil { return empty, err }
	defer f.Close()
	h := sha256.New()
	n, err := io.Copy(h, f)
	if err != nil { return empty, err }
	if n != info.Size() { return empty, errors.New("file changed during backup verification") }
	var result [32]byte
	copy(result[:], h.Sum(nil))
	return result, nil
}

// verifyUpgradeDBInventory rejects obviously truncated or redirected
// snapshots. It only checks the direct DB directory entries, NOT live SQLite
// WAL atomicity, table integrity or a consistent cross-DB restore point.
func verifyUpgradeDBInventory(live, backup string) error {
	if err := regularUpgradeBackupDir(live); err != nil { return err }
	if err := regularUpgradeBackupDir(backup); err != nil { return err }
	source, err := os.ReadDir(live)
	if err != nil { return err }
	copied, err := os.ReadDir(backup)
	if err != nil { return err }
	if len(source) == 0 || len(source) != len(copied) {
		return errors.New("database directory entries are missing or incomplete")
	}
	for i, entry := range source {
		other := copied[i]
		if entry.Name() != other.Name() || !entry.Type().IsRegular() || !other.Type().IsRegular() {
			return errUpgradeRuntimeOwnership
		}
		// SQLite writes can race the copy: do not compare live DB content
		// here or claim a consistent snapshot. Reject missing/zero files.
		info, err := other.Info()
		if err != nil || info.Size() == 0 {
			return errors.New("database backup contains missing or empty file")
		}
	}
	return nil
}
