package service

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

const maxUpgradeSealEntries = 20000

// sealUpgradeBackupEvidence hashes the exact downloaded archive and a sorted,
// content-hashed manifest of the rollback directory. The digest proves the
// artifact/backup bytes observed before the first executable replacement;
// it does not claim that copied live SQLite files form a transactionally
// consistent database snapshot.
func sealUpgradeBackupEvidence(originalDir, archivePath string) (string, string, error) {
	archiveDigest, err := regularUpgradeFileHash(archivePath)
	if err != nil {
		return "", "", fmt.Errorf("verify downloaded release archive: %w", err)
	}
	archiveSHA := hex.EncodeToString(archiveDigest[:])
	rootInfo, err := os.Lstat(originalDir)
	if err != nil || !rootInfo.IsDir() || rootInfo.Mode()&os.ModeSymlink != 0 {
		return "", "", fmt.Errorf("rollback evidence root is redirected or unavailable")
	}

	manifest := sha256.New()
	if _, err := io.WriteString(manifest, "gpupanel-upgrade-seal.v1\narchive-sha256:"+archiveSHA+"\n"); err != nil {
		return "", "", err
	}
	entries := 0
	err = filepath.WalkDir(originalDir, func(filePath string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if filePath == originalDir {
			return nil
		}
		entries++
		if entries > maxUpgradeSealEntries {
			return fmt.Errorf("rollback evidence exceeds bounded entry count")
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("rollback evidence contains a symlink")
		}
		info, err := os.Lstat(filePath)
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(originalDir, filePath)
		if err != nil || rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			return fmt.Errorf("rollback evidence contains an invalid relative path")
		}
		rel = filepath.ToSlash(rel)
		switch {
		case info.IsDir():
			_, err = fmt.Fprintf(manifest, "dir\t%s\t%04o\n", rel, info.Mode().Perm())
			return err
		case info.Mode().IsRegular():
			digest, hashErr := regularUpgradeFileHash(filePath)
			if hashErr != nil {
				return fmt.Errorf("rollback evidence file %s: %w", rel, hashErr)
			}
			_, err = fmt.Fprintf(manifest, "file\t%s\t%04o\t%d\t%s\n",
				rel, info.Mode().Perm(), info.Size(), hex.EncodeToString(digest[:]))
			return err
		default:
			return fmt.Errorf("rollback evidence contains a non-regular entry")
		}
	})
	if err != nil {
		return "", "", fmt.Errorf("seal rollback inventory: %w", err)
	}
	if entries == 0 {
		return "", "", fmt.Errorf("rollback inventory is empty")
	}
	return archiveSHA, hex.EncodeToString(manifest.Sum(nil)), nil
}
