package service

import (
	"errors"
	"fmt"
)

var errUpgradeAdmissionBusy = errors.New("GPUPanel upgrade refused: another or unreconciled upgrade owns SystemStatus")

// upgradeStatusCAS is the existing SettingRepo.UpdateIfMatch operation, backed
// by a single conditional SQLite UPDATE. Never use read-cache-then-write:
// concurrent requests for different versions must not each enter a stage.
type upgradeStatusCAS func(key, old, value string) (bool, error)

func claimUpgradeAdmission(cas upgradeStatusCAS) error {
	if cas == nil {
		return fmt.Errorf("%w: status store unavailable", errUpgradeAdmissionBusy)
	}
	claimed, err := cas("SystemStatus", "Free", "Upgrading")
	if err != nil {
		return fmt.Errorf("%w: %v", errUpgradeAdmissionBusy, err)
	}
	if !claimed {
		return errUpgradeAdmissionBusy
	}
	return nil
}

// releaseUpgradeAdmission only clears a claim when its transaction never
// modified running binaries OR the full immediate file rollback succeeded.
// A crash/incomplete rollback keeps Upgrading as a fail-closed operator hold.
// This is NOT a transaction-owner token and doesn't prove runtime health.
func releaseUpgradeAdmission(cas upgradeStatusCAS) error {
	if cas == nil {
		return errUpgradeAdmissionBusy
	}
	released, err := cas("SystemStatus", "Upgrading", "Free")
	if err != nil {
		return fmt.Errorf("upgrade status reconciliation failed: %w", err)
	}
	if !released {
		return errors.New("upgrade status was modified by another operation; operator reconciliation required")
	}
	return nil
}
