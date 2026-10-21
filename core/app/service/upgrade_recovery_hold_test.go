package service

import (
	"os"
	"strings"
	"testing"
)

// These source-level contracts protect the asynchronous upgrade worker's
// safety boundary. They intentionally do not certify real Ubuntu rollback
// or health: a guest execution is required before G3 can be accepted.
func upgradeSourceRegion(t *testing.T, start, end string) string {
	t.Helper()
	raw, err := os.ReadFile("upgrade.go")
	if err != nil {
		t.Fatal(err)
	}
	src := string(raw)
	from := strings.Index(src, start)
	if from < 0 {
		t.Fatalf("required upgrade boundary missing: %q", start)
	}
	until := strings.Index(src[from+len(start):], end)
	if until < 0 {
		t.Fatalf("required upgrade boundary missing: %q", end)
	}
	return src[from : from+len(start)+until]
}

func TestG3FileOnlyRollbackNeverReleasesDurableAdmission(t *testing.T) {
	rollback := upgradeSourceRegion(t,
		"rollbackAndReconcile := func(step int) {",
		"\n\tgo func() {",
	)
	if !strings.Contains(rollback, "u.handleRollback(originalDir, step, svcInfo)") {
		t.Fatal("file rollback handler is missing")
	}
	if strings.Contains(rollback, "releaseUpgradeAdmission(") ||
		strings.Contains(rollback, "SystemStatus\", \"Free") {
		t.Fatal("file-only rollback released the unresolved upgrade admission")
	}
	if !strings.Contains(rollback, "upgrade admission remains blocked") {
		t.Fatal("unverified file rollback must report unresolved status")
	}
}

func TestG3StagedUpgradeRetainsBackupsUntilHealthAndDataReconciliation(t *testing.T) {
	finalize := upgradeSourceRegion(t,
		"upgrade files staged; restart and Core/Agent health have NOT been verified",
		"\n\t}()",
	)
	if strings.Contains(finalize, "dropBackupCopies()") ||
		strings.Contains(finalize, "releaseUpgradeAdmission(") ||
		strings.Contains(finalize, "SystemStatus\", \"Free") {
		t.Fatal("upgrade finalized, pruned rollback copies or released hold before live recovery")
	}
	if !strings.Contains(finalize, "controller.RestartPanel(true, true, true)") {
		t.Fatal("expected separate restart request for unverified staged upgrade")
	}
	if !strings.Contains(finalize, "verified reconciliation") {
		t.Fatal("retention until separate reconciliation is no longer documented")
	}
}

func TestG3OnlyPreMutationFailuresMayReleaseAdmissionAutomatically(t *testing.T) {
	admission := upgradeSourceRegion(t,
		"releaseBeforeMutation := func() {",
		"\n\trollbackAndReconcile :=",
	)
	if !strings.Contains(admission, "releaseUpgradeAdmission(settingRepo.UpdateIfMatch)") {
		t.Fatal("pre-mutation failures must still release their admission")
	}
}
