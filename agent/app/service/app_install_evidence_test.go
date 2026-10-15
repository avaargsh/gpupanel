package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/1Panel-dev/1Panel/agent/app/model"
	"github.com/1Panel-dev/1Panel/agent/constant"
	"github.com/docker/docker/api/types/container"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func appEvidenceFixture(t *testing.T, appStatus, taskStatus string) (*gorm.DB, *gorm.DB, model.AppInstall) {
	t.Helper()
	appDB, taskDB, install := operationStatusTestDB(t)
	install.Status = appStatus
	install.ContainerName = "evidence-container"
	install.Env = `{"PRIVATE_KEY":"do-not-return","PASSWORD":"secret"}`
	if err := appDB.Omit(clause.Associations).Save(&install).Error; err != nil {
		t.Fatal(err)
	}
	if taskStatus != "" {
		task := model.Task{
			ID: "a1111111-1111-4111-8111-111111111111", Name: install.Name,
			Type: "App", Operate: "TaskInstall", ResourceID: install.ID,
			Status: taskStatus,
		}
		if err := taskDB.Create(&task).Error; err != nil {
			t.Fatal(err)
		}
	}
	return appDB, taskDB, install
}

func appRunningObserver(project string) appDockerObserver {
	return func(names []string) ([]appContainerObservation, error) {
		return []appContainerObservation{{
			Name: "evidence-container", State: "running",
			Labels: map[string]string{"com.docker.compose.project": project},
		}}, nil
	}
}

func TestAppInstallEvidenceConsistentIsStillUnverified(t *testing.T) {
	appDB, taskDB, install := appEvidenceFixture(t, constant.StatusRunning, constant.StatusSuccess)
	result, err := inspectAppInstallEvidence(appDB, taskDB, install.ID, appRunningObserver(install.Name))
	if err != nil { t.Fatal(err) }
	if result.Classification != appEvidenceConsistent || result.Verified || len(result.Containers) != 1 {
		t.Fatalf("unexpected evidence classification: %+v", result)
	}
	raw, err := json.Marshal(result)
	if err != nil { t.Fatal(err) }
	if strings.Contains(string(raw), "do-not-return") || strings.Contains(string(raw), "secret") ||
		strings.Contains(string(raw), "PRIVATE_KEY") || strings.Contains(string(raw), "composePath") {
		t.Fatalf("sensitive data leaked: %s", raw)
	}
	if result.TaskStatus != constant.StatusSuccess {
		t.Fatal("success task not linked to AppInstall")
	}
}

func TestAppInstallEvidencePartialAndNoAutoReconciliation(t *testing.T) {
	appDB, taskDB, install := appEvidenceFixture(t, constant.StatusRunning, constant.StatusSuccess)
	result, err := inspectAppInstallEvidence(appDB, taskDB, install.ID, func([]string) ([]appContainerObservation, error) {
		return nil, nil
	})
	if err != nil { t.Fatal(err) }
	if result.Classification != appEvidencePartial || result.Reasons[0] != "EXPECTED_CONTAINER_MISSING" {
		t.Fatalf("missing Docker resource classified incorrectly: %+v", result)
	}
	var original model.AppInstall
	if err := appDB.First(&original, install.ID).Error; err != nil { t.Fatal(err) }
	if original.Status != constant.StatusRunning || original.Env != install.Env {
		t.Fatal("read-only snapshot unexpectedly mutated AppInstall DB")
	}
}

func TestAppInstallEvidenceUnknownDoesNotBecomeSuccess(t *testing.T) {
	appDB, taskDB, install := appEvidenceFixture(t, constant.StatusUnknown, constant.StatusUnknown)
	result, err := inspectAppInstallEvidence(appDB, taskDB, install.ID, appRunningObserver(install.Name))
	if err != nil { t.Fatal(err) }
	if result.Classification != appEvidenceUnknown || result.Verified {
		t.Fatalf("UNKNOWN was silently resolved: %+v", result)
	}
}

func TestAppInstallEvidenceConflictForWrongComposeOwnership(t *testing.T) {
	appDB, taskDB, install := appEvidenceFixture(t, constant.StatusRunning, constant.StatusSuccess)
	result, err := inspectAppInstallEvidence(appDB, taskDB, install.ID, appRunningObserver("different-app"))
	if err != nil { t.Fatal(err) }
	if result.Classification != appEvidenceConflict || len(result.Reasons) != 1 ||
		result.Reasons[0] != "CONTAINER_OWNERSHIP_CONFLICT" {
		t.Fatalf("wrong project owner incorrectly accepted: %+v", result)
	}
}

func TestAppInstallEvidenceConflictForCompetingAppRecord(t *testing.T) {
	appDB, taskDB, install := appEvidenceFixture(t, constant.StatusRunning, constant.StatusSuccess)
	other := model.AppInstall{
		Name: "other-app", AppId: 2, AppDetailId: 2, Version: "1",
		Status: constant.StatusStopped, ContainerName: "evidence-container", ServiceName: "other",
	}
	if err := appDB.Omit(clause.Associations).Create(&other).Error; err != nil { t.Fatal(err) }
	result, err := inspectAppInstallEvidence(appDB, taskDB, install.ID, appRunningObserver(install.Name))
	if err != nil { t.Fatal(err) }
	if result.Classification != appEvidenceConflict {
		t.Fatalf("competing app claim incorrectly accepted: %+v", result)
	}
}

func TestAppInstallEvidenceUnknownWhenTaskOrDockerUnavailable(t *testing.T) {
	appDB, taskDB, install := appEvidenceFixture(t, constant.StatusRunning, "")
	result, err := inspectAppInstallEvidence(appDB, taskDB, install.ID, appRunningObserver(install.Name))
	if err != nil { t.Fatal(err) }
	if result.Classification != appEvidenceUnknown {
		t.Fatalf("missing task accepted as verified installation: %+v", result)
	}
	result, err = inspectAppInstallEvidence(appDB, taskDB, install.ID, func([]string) ([]appContainerObservation, error) {
		return nil, errors.New("connection string and secret should never be returned")
	})
	if err != nil { t.Fatal(err) }
	if result.Classification != appEvidenceUnknown || strings.Contains(strings.Join(result.Reasons, ","), "secret") {
		t.Fatalf("Docker error was exposed or falsely classified: %+v", result)
	}
	result, err = inspectAppInstallEvidence(appDB, nil, install.ID, appRunningObserver(install.Name))
	if err != nil { t.Fatal(err) }
	if result.Classification != appEvidenceUnknown { t.Fatalf("TaskDB absence misclassified: %+v", result) }
	result, err = inspectAppInstallEvidence(nil, taskDB, install.ID, appRunningObserver(install.Name))
	if err != nil { t.Fatal(err) }
	if result.Classification != appEvidenceUnknown { t.Fatalf("AppDB absence misclassified: %+v", result) }
}

func TestAppInstallEvidenceBoundedOwnershipScan(t *testing.T) {
	appDB, taskDB, install := appEvidenceFixture(t, constant.StatusRunning, constant.StatusSuccess)
	// One existing owner plus 1023 extra records hits the bounded scan ceiling.
	// The observer must not run once we cannot rule out later competing claims.
	others := make([]model.AppInstall, 0, 1023)
	for i := 0; i < 1023; i++ {
		others = append(others, model.AppInstall{
			Name: fmt.Sprintf("independent-app-%04d", i),
			AppId: 2, AppDetailId: 2, Version: "1",
			Status: constant.StatusStopped,
			ContainerName: fmt.Sprintf("unrelated-container-%04d", i),
			ServiceName: "unrelated",
		})
	}
	if err := appDB.Omit(clause.Associations).CreateInBatches(&others, 64).Error; err != nil {
		t.Fatal(err)
	}
	observerCalled := false
	result, err := inspectAppInstallEvidence(appDB, taskDB, install.ID, func([]string) ([]appContainerObservation, error) {
		observerCalled = true
		return nil, nil
	})
	if err != nil { t.Fatal(err) }
	if observerCalled || result.Classification != appEvidenceUnknown || result.Verified ||
		len(result.Reasons) != 1 || result.Reasons[0] != "OWNERSHIP_SCAN_LIMIT" {
		t.Fatalf("saturated owner lookup did not fail closed: %+v (called=%v)", result, observerCalled)
	}
}

func TestAppInstallEvidenceDockerAliasNameMatching(t *testing.T) {
	summaries := []container.Summary{
		{ID: "one", Names: []string{"/non-install-alias", "/evidence-container"},
			State: "running", Labels: map[string]string{"com.docker.compose.project": "my-app"}},
		{ID: "two", Names: nil, State: "running"},
		{ID: "three", Names: []string{"/evidence-container-other"}, State: "running"},
	}
	got := appEvidenceObservationsByRequestedName([]string{"evidence-container"}, summaries)
	if len(got) != 1 || got[0].Name != "evidence-container" ||
		got[0].State != "running" || got[0].Labels["com.docker.compose.project"] != "my-app" {
		t.Fatalf("second Docker alias was not matched exactly: %+v", got)
	}
}

func TestAppInstallEvidenceMultipleAliasesNeverCreateExtraContainers(t *testing.T) {
	summaries := []container.Summary{
		{ID: "one", Names: []string{"/unrelated", "/first", "/second"}, State: "running"},
	}
	got := appEvidenceObservationsByRequestedName([]string{"first", "second"}, summaries)
	if len(got) != 1 || got[0].Name != "first" {
		t.Fatalf("one physical container must not fabricate two observations: %+v", got)
	}
	appDB, taskDB, install := appEvidenceFixture(t, constant.StatusRunning, constant.StatusSuccess)
	install.ContainerName = "first,second"
	if err := appDB.Omit(clause.Associations).Save(&install).Error; err != nil {
		t.Fatal(err)
	}
	out, err := inspectAppInstallEvidence(appDB, taskDB, install.ID, func([]string) ([]appContainerObservation, error) {
		return got, nil
	})
	if err != nil { t.Fatal(err) }
	if out.Verified || out.Classification != appEvidencePartial || len(out.Containers) != 2 ||
		out.Containers[1].State != "missing" {
		t.Fatalf("aliases incorrectly proved two containers: %+v", out)
	}
}

func TestAppInstallEvidenceIgnoresUnrequestedAndNamelessContainers(t *testing.T) {
	summaries := []container.Summary{
		{Names: nil, State: "running"},
		{Names: []string{"/target-extra"}, State: "running"},
		{Names: []string{"/TARGET"}, State: "running"},
	}
	if got := appEvidenceObservationsByRequestedName([]string{"target"}, summaries); len(got) != 0 {
		t.Fatalf("unexpected false-positive evidence: %+v", got)
	}
}
