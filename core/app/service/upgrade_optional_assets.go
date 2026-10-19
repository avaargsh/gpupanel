package service

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// optionalUpgradeAsset distinguishes a genuinely absent optional asset
// from a redirected, unreadable or malformed one. A missing installed asset
// is not a reason to abort an otherwise valid Core/Agent-only upgrade;
// it must also never be silently created by the upgrade or rollback.
//
// Callers supply only fixed, reviewed asset paths, not HTTP input.
func optionalUpgradeAsset(path string, directory bool) (bool, error) {
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("inspect optional upgrade asset %q: %w", filepath.Base(path), err)
	}
	if info.Mode()&os.ModeSymlink != 0 ||
		(directory && !info.IsDir()) ||
		(!directory && (!info.Mode().IsRegular() || info.Size() == 0)) {
		return false, fmt.Errorf("%w: optional upgrade asset %q is redirected or malformed",
			errUpgradeRuntimeOwnership, filepath.Base(path))
	}
	return true, nil
}

// shouldCopyOptionalUpgradeAsset deliberately does NOT introduce new
// language/GeoIP resources when the original install lacked them. This
// preserves the ability to roll back without destructive removal. The
// original asset's backup is required whenever replacement is attempted.
func shouldCopyOptionalUpgradeAsset(installed, snapshot, incoming string, directory bool) (bool, error) {
	exists, err := optionalUpgradeAsset(installed, directory)
	if err != nil || !exists {
		return false, err
	}
	backup, err := optionalUpgradeAsset(snapshot, directory)
	if err != nil {
		return false, err
	}
	if !backup {
		return false, fmt.Errorf("%w: original optional asset has no rollback backup",
			errUpgradeRuntimeOwnership)
	}
	next, err := optionalUpgradeAsset(incoming, directory)
	if err != nil {
		return false, err
	}
	return next, nil
}
