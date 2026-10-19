package service

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/avaargsh/GPUPanel/agent/global"
)

// AppInstallFilesystemPreflight checks only both configured app-install roots
// and one level of app keys beneath each root; never traverses unknown paths,
// follows symlinks, reads application files, or deletes anything.
type AppInstallFilesystemPreflight struct {
	NameKey        string    `json:"nameKey"`
	HostFingerprint string   `json:"hostFingerprint,omitempty"`
	ObservedAt     time.Time `json:"observedAt"`
	KnownRootsClear bool     `json:"knownRootsClear"`
	Verified       bool      `json:"verified"`
	CanRelease     bool      `json:"canRelease"`
	Reasons        []string  `json:"reasons"`
	RootsChecked   int       `json:"rootsChecked"`
}

const maxAppFilesystemEntries = 256

// boundedReadDir returns nil for excessive or uncertain directory listings.
// It limits listing to 257 entries instead of allocating the entire listing.
func boundedAppReadDir(path string) ([]os.DirEntry, error) {
	f, err := os.Open(path)
	if err != nil { return nil, err }
	defer f.Close()
	items, err := f.ReadDir(maxAppFilesystemEntries + 1)
	if err != nil && !errors.Is(err, io.EOF) { return nil, err }
	if len(items) > maxAppFilesystemEntries {
		return nil, errors.New("directory inventory saturated")
	}
	return items, nil
}

// inspectAppInstallFilesystemPreflight never trusts a missing root, symlink,
// unreadable directory or unknown/non-directory app-key entry as clearance.
// Even a successful scan is NOT a check of volumes, host bind mounts and
// arbitrary user-selected data directories elsewhere on the host.
func inspectAppInstallFilesystemPreflight(name, hostFingerprint string, roots []string) (AppInstallFilesystemPreflight, error) {
	out := AppInstallFilesystemPreflight{
		ObservedAt: time.Now().UTC(), Reasons: []string{},
		Verified: false, CanRelease: false,
	}
	key, err := NormalizeAppInstallNameKey(name)
	if err != nil { return out, err }
	out.NameKey, out.HostFingerprint = key, hostFingerprint
	if len(roots) != 2 || roots[0] == "" || roots[1] == "" ||
		!g5HostHash.MatchString(hostFingerprint) {
		out.Reasons = append(out.Reasons, "HOST_OR_APP_ROOTS_UNAVAILABLE")
		return out, nil
	}
	unresolved, residue := false, false
	for _, root := range roots {
		if !filepath.IsAbs(root) || filepath.Clean(root) != root ||
			root == "/" {
			unresolved = true
			continue
		}
		real, err := filepath.EvalSymlinks(root)
		if err != nil || real != root {
			unresolved = true
			continue
		}
		stat, err := os.Lstat(root)
		if err != nil || !stat.IsDir() || stat.Mode()&os.ModeSymlink != 0 {
			unresolved = true
			continue
		}
		appKeys, err := boundedAppReadDir(root)
		if err != nil { unresolved = true; continue }
		out.RootsChecked++
		for _, appKey := range appKeys {
			if !appKey.IsDir() || appKey.Type()&os.ModeSymlink != 0 {
				// Files or symlinked app keys are not safe to ignore.
				unresolved = true
				continue
			}
			path := filepath.Join(root, appKey.Name())
			instances, err := boundedAppReadDir(path)
			if err != nil { unresolved = true; continue }
			for _, entry := range instances {
				if strings.EqualFold(strings.TrimSpace(entry.Name()), key) {
					// Any directory/file/symlink for this name is residue;
					// never follow a symlink to check its target.
					residue = true
				}
				if entry.Type()&os.ModeSymlink != 0 {
					unresolved = true
				}
			}
		}
	}
	if residue { out.Reasons = append(out.Reasons, "APP_INSTANCE_FILESYSTEM_RESIDUE") }
	if unresolved { out.Reasons = append(out.Reasons, "APP_INSTALL_PATH_OWNERSHIP_UNKNOWN") }
	if !residue && !unresolved && out.RootsChecked == len(roots) {
		out.KnownRootsClear = true
		out.Reasons = append(out.Reasons, "NO_MATCHING_INSTANCE_IN_CONFIGURED_APP_ROOTS")
	}
	out.Reasons = append(out.Reasons, "EXTERNAL_BIND_MOUNTS_AND_USER_PATHS_NOT_OBSERVED")
	return out, nil
}

// inspectAgentAppInstallPaths uses only Agent's configured roots. A raw
// machine-id is never returned. Host identity is correlation, not attestation.
func inspectAgentAppInstallPaths(name string) (AppInstallFilesystemPreflight, error) {
	fingerprint, err := observerHostFingerprint(os.ReadFile)
	if err != nil { fingerprint = "" }
	return inspectAppInstallFilesystemPreflight(name, fingerprint, []string{
		global.Dir.AppInstallDir, global.Dir.LocalAppInstallDir,
	})
}
