package service

import (
	"os"
	"regexp"
	"testing"

	"github.com/avaargsh/GPUPanel/agent/constant"
	"github.com/avaargsh/GPUPanel/agent/global"
	"gorm.io/gorm/clause"
)

// TestAppInstallEvidenceLiveDocker must be run in a disposable CI Docker context.
// It exercises the real Agent Docker adapter, not a mocked observation. The
// workflow owns container creation/stop/cleanup; the test does zero Docker writes.
func TestAppInstallEvidenceLiveDocker(t *testing.T) {
	name := os.Getenv("GPUPANEL_EVIDENCE_CONTAINER")
	phase := os.Getenv("GPUPANEL_EVIDENCE_PHASE")
	if name == "" {
		t.Skip("set GPUPANEL_EVIDENCE_CONTAINER on disposable CI Docker host")
	}
	if !regexp.MustCompile(`^gpupanel-evidence-[0-9a-f]{16}$`).MatchString(name) {
		t.Fatal("refusing unexpected Docker evidence container name")
	}
	if phase != "running" && phase != "exited" {
		t.Fatal("GPUPANEL_EVIDENCE_PHASE must be running or exited")
	}

	appDB, taskDB, install := appEvidenceFixture(t, constant.StatusRunning, constant.StatusSuccess)
	install.Name = name
	install.ContainerName = name
	if err := appDB.Omit(clause.Associations).Save(&install).Error; err != nil {
		t.Fatal(err)
	}
	// The production Docker observer discovers DockerSockPath via global.DB.
	// Isolate this pointer for the non-parallel test; use no real AppInstall DB.
	previousDB := global.DB
	global.DB = appDB
	t.Cleanup(func() { global.DB = previousDB })
	out, err := inspectAppInstallEvidence(appDB, taskDB, install.ID, listAppContainersForEvidence)
	if err != nil {
		t.Fatal(err)
	}
	if out.Verified || len(out.Containers) != 1 || out.Containers[0].Name != name {
		t.Fatalf("invalid or misleading live Docker evidence: %+v", out)
	}
	if phase == "running" {
		if out.Classification != appEvidenceConsistent || out.Containers[0].State != "running" {
			t.Fatalf("real running container did not match DB/task snapshot: %+v", out)
		}
	} else {
		if out.Classification != appEvidencePartial || out.Containers[0].State == "running" {
			t.Fatalf("stopped container was incorrectly accepted as running: %+v", out)
		}
	}
	// Read-only evidence must not reconcile or modify an install, even after
	// Docker state changes.
	var reread struct{ Status string }
	if err := appDB.Model(&install).Select("status").First(&reread, install.ID).Error; err != nil {
		t.Fatal(err)
	}
	if reread.Status != constant.StatusRunning {
		t.Fatalf("read-only observer mutated persisted state: %q", reread.Status)
	}
}
