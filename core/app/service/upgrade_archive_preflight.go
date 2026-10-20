package service

import (
	"archive/tar"
	"compress/gzip"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"strings"
	"syscall"
)

var errUpgradeArchiveRejected = errors.New("GPUPanel upgrade archive rejected")

const (
	maxUpgradeArchiveBytes = int64(1024 << 20)
	maxUpgradeEntryBytes   = int64(512 << 20)
	maxUpgradeExpanded     = int64(2 << 30)
	maxUpgradeEntries      = 4096
)

// validateUpgradeArchive is a read-only gate BEFORE HandleUnTar is called on
// the downloaded archive. The release builder creates one root folder named
// exactly gpupanel-<version>-linux-<arch>, containing regular files and dirs.
// Prevent a malicious tar entry from writing elsewhere as the privileged Core.
//
// This is a structural/integrity check, NOT a publisher signature. Signed
// release provenance and offline SQLite backup consistency remain G3 blockers.
func validateUpgradeArchive(filename, packageName string) error {
	deny := func(reason string) error {
		return fmt.Errorf("%w: %s", errUpgradeArchiveRejected, reason)
	}
	if packageName == "" || path.Base(packageName) != packageName ||
		strings.ContainsAny(packageName, "\\/:") || strings.Contains(packageName, "..") {
		return deny("invalid package root")
	}
	// Refuse even a final-component symlink, including one swapped into place
	// between inspection and opening (privileged update process).
	descriptor, err := syscall.Open(filename, syscall.O_RDONLY|syscall.O_CLOEXEC|syscall.O_NOFOLLOW, 0)
	if err != nil { return fmt.Errorf("%w: open non-redirected archive: %v", errUpgradeArchiveRejected, err) }
	file := os.NewFile(uintptr(descriptor), filename)
	defer file.Close()
	stat, err := file.Stat()
	if err != nil || !stat.Mode().IsRegular() || stat.Size() <= 0 || stat.Size() > maxUpgradeArchiveBytes {
		return deny("archive is not a bounded regular file")
	}
	zr, err := gzip.NewReader(file)
	if err != nil { return deny("invalid gzip stream") }
	defer zr.Close()
	reader := tar.NewReader(zr)
	required := map[string]bool{
		"gpupanel-core": false,
		"gpupanel-agent": false,
		"pctl": false,
		"initscript/gpupanel-core.service": false,
		"initscript/gpupanel-agent.service": false,
	}
	seen := make(map[string]bool)
	var total int64
	for count := 0; ; count++ {
		if count >= maxUpgradeEntries { return deny("too many archive entries") }
		header, err := reader.Next()
		if errors.Is(err, io.EOF) { break }
		if err != nil { return deny("truncated or malformed tar stream") }
		name := strings.TrimSuffix(header.Name, "/")
		if name != packageName && !strings.HasPrefix(name, packageName+"/") {
			return deny("tar entry escapes the expected release folder")
		}
		if name == packageName && header.Typeflag != tar.TypeDir {
			return deny("release root must be a directory")
		}
		if path.IsAbs(name) || strings.ContainsAny(name, "\\:") ||
			path.Clean(name) != name || seen[name] {
			return deny("invalid, redirected or duplicate tar path")
		}
		for _, component := range strings.Split(name, "/") {
			if component == "" || component == "." || component == ".." {
				return deny("unsafe tar path component")
			}
		}
		seen[name] = true
		if header.Mode&07000 != 0 || header.Mode&0022 != 0 {
			return deny("unsafe archive permissions")
		}
		switch header.Typeflag {
		case tar.TypeDir:
			if header.Size != 0 { return deny("directory contains unexpected payload") }
		case tar.TypeReg, tar.TypeRegA:
			if header.Size < 0 || header.Size > maxUpgradeEntryBytes ||
				total > maxUpgradeExpanded-header.Size {
				return deny("oversized upgrade entry or expanded archive")
			}
			total += header.Size
			rel := strings.TrimPrefix(name, packageName+"/")
			if _, present := required[rel]; present {
				if header.Size == 0 || (strings.HasPrefix(rel, "gpupanel-") || rel == "pctl") && header.Mode&0111 == 0 {
					return deny("required binary or script is empty or not executable")
				}
				required[rel] = true
			}
			if _, err := io.CopyN(io.Discard, reader, header.Size); err != nil {
				return deny("truncated upgrade entry")
			}
		default:
			// No symlinks, hardlinks, devices, FIFOs, PAX-created link
			// targets or whiteouts may be extracted into privileged paths.
			return deny("non-file entry in release archive")
		}
	}
	for name, exists := range required {
		if !exists { return deny("missing required release entry: " + name) }
	}
	return nil
}
