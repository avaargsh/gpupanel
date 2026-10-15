package service

import (
	"errors"
	"strings"
	"time"

	"github.com/1Panel-dev/1Panel/agent/app/model"
	"github.com/1Panel-dev/1Panel/agent/constant"
	"github.com/1Panel-dev/1Panel/agent/global"
	"github.com/1Panel-dev/1Panel/agent/utils/docker"
	"gorm.io/gorm"
)

// AppInstallEvidence is a redacted, on-demand snapshot, not a recovery
// authorization. In particular, it never returns app.Env, AppInstall.Param,
// Docker labels, task ErrorMsg, filesystem contents or a Compose manifest.
type AppInstallEvidence struct {
	InstallID      uint                       `json:"installId"`
	Name           string                     `json:"name,omitempty"`
	AppStatus      string                     `json:"appStatus,omitempty"`
	TaskID         string                     `json:"taskId,omitempty"`
	TaskStatus     string                     `json:"taskStatus,omitempty"`
	Classification string                     `json:"classification"`
	Reasons        []string                   `json:"reasons"`
	Containers     []AppInstallContainerState `json:"containers"`
	ObservedAt     time.Time                  `json:"observedAt"`
	Verified       bool                       `json:"verified"`
}

type AppInstallContainerState struct {
	Name  string `json:"name"`
	State string `json:"state"`
}

type appContainerObservation struct {
	Name   string
	State  string
	Labels map[string]string
}

type appDockerObserver func(names []string) ([]appContainerObservation, error)

const (
	appEvidenceConsistent = "CONSISTENT"
	appEvidencePartial    = "PARTIAL"
	appEvidenceConflict   = "CONFLICT"
	appEvidenceUnknown    = "UNKNOWN"
)

// InspectAppInstallEvidence uses only the existing Agent DBs and Docker
// read APIs; it neither acknowledges UNKNOWN nor changes either state store.
func InspectAppInstallEvidence(installID uint) (AppInstallEvidence, error) {
	return inspectAppInstallEvidence(global.DB, global.TaskDB, installID, listAppContainersForEvidence)
}

func listAppContainersForEvidence(names []string) ([]appContainerObservation, error) {
	cli, err := docker.NewClient()
	if err != nil {
		return nil, err
	}
	defer cli.Close()
	containers, err := cli.ListContainersByName(names)
	if err != nil {
		return nil, err
	}
	result := make([]appContainerObservation, 0, len(containers))
	for _, con := range containers {
		// The existing Docker adapter uses the first name. Never expose raw
		// Docker labels: they may contain application/vendor data.
		if len(con.Names) == 0 {
			continue
		}
		result = append(result, appContainerObservation{
			Name: strings.TrimPrefix(con.Names[0], "/"),
			State: con.State,
			Labels: con.Labels,
		})
	}
	return result, nil
}

func appExpectedContainerNames(csv string) []string {
	var names []string
	seen := make(map[string]bool)
	for _, token := range strings.Split(csv, ",") {
		name := strings.TrimSpace(token)
		if name != "" && !seen[name] {
			seen[name] = true
			names = append(names, name)
		}
	}
	return names
}

// DB reads and Docker inspection are not an atomic snapshot; the consumer
// must review fresh evidence again immediately before any future mutation.
func inspectAppInstallEvidence(appDB, taskDB *gorm.DB, id uint, observe appDockerObserver) (AppInstallEvidence, error) {
	out := AppInstallEvidence{
		InstallID: id, Classification: appEvidenceUnknown,
		Reasons: []string{}, Containers: []AppInstallContainerState{},
		ObservedAt: time.Now().UTC(), Verified: false,
	}
	if id == 0 {
		return out, errors.New("application installation ID is required")
	}
	if appDB == nil {
		out.Reasons = append(out.Reasons, "APP_DB_UNAVAILABLE")
		return out, nil
	}
	var install model.AppInstall
	if err := appDB.Where("id = ?", id).First(&install).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			out.Reasons = append(out.Reasons, "APP_INSTALL_NOT_FOUND")
		} else {
			out.Reasons = append(out.Reasons, "APP_DB_UNAVAILABLE")
		}
		return out, nil
	}
	out.Name, out.AppStatus = install.Name, install.Status

	if taskDB == nil {
		out.Reasons = append(out.Reasons, "TASK_DB_UNAVAILABLE")
	} else {
		var task model.Task
		err := taskDB.Select("id", "status", "resource_id", "created_at").
			Where("type = ? AND operate = ? AND resource_id = ?", "App", "TaskInstall", id).
			Order("created_at DESC").First(&task).Error
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			out.Reasons = append(out.Reasons, "LINKED_INSTALL_TASK_NOT_FOUND")
		case err != nil:
			out.Reasons = append(out.Reasons, "TASK_DB_UNAVAILABLE")
		default:
			out.TaskID, out.TaskStatus = task.ID, task.Status
		}
	}

	expected := appExpectedContainerNames(install.ContainerName)
	if len(expected) == 0 || len(expected) > 32 {
		out.Reasons = append(out.Reasons, "EXPECTED_CONTAINER_SET_UNAVAILABLE")
		return out, nil
	}

	// A Docker name claimed by two AppInstall rows cannot be attributed to
	// either using that name alone, regardless of what Docker returns.
	var claims []model.AppInstall
	if err := appDB.Select("id", "container_name").Find(&claims).Error; err != nil {
		out.Reasons = append(out.Reasons, "OWNERSHIP_LOOKUP_UNAVAILABLE")
		return out, nil
	}
	targetNames := make(map[string]bool, len(expected))
	for _, name := range expected {
		targetNames[name] = true
	}
	duplicateClaim := false
	for _, other := range claims {
		if other.ID == id {
			continue
		}
		for _, name := range appExpectedContainerNames(other.ContainerName) {
			if targetNames[name] {
				duplicateClaim = true
			}
		}
	}

	if observe == nil {
		out.Reasons = append(out.Reasons, "DOCKER_OBSERVER_UNAVAILABLE")
		return out, nil
	}
	observed, err := observe(expected)
	if err != nil {
		out.Reasons = append(out.Reasons, "DOCKER_OBSERVATION_UNAVAILABLE")
		return out, nil
	}
	byName := make(map[string]appContainerObservation, len(observed))
	ownershipMismatch := false
	ownershipUnproven := false
	for _, container := range observed {
		if !targetNames[container.Name] {
			// Never attribute an unrequested container to this install.
			continue
		}
		if _, duplicate := byName[container.Name]; duplicate {
			ownershipMismatch = true
		}
		byName[container.Name] = container
		if project, hasLabel := container.Labels["com.docker.compose.project"]; hasLabel {
			if project == "" || !strings.EqualFold(project, install.Name) {
				// Custom Compose project names may legitimately differ.
				// Report a potential conflict; do not alter the container.
				ownershipMismatch = true
			}
		} else {
			ownershipUnproven = true
		}
	}

	missing := 0
	nonRunning := 0
	for _, name := range expected {
		state := "missing"
		if found, ok := byName[name]; ok {
			state = found.State
		} else {
			missing++
		}
		if state != "running" {
			nonRunning++
		}
		out.Containers = append(out.Containers, AppInstallContainerState{Name: name, State: state})
	}

	switch {
	case duplicateClaim || ownershipMismatch:
		out.Classification = appEvidenceConflict
		out.Reasons = append(out.Reasons, "CONTAINER_OWNERSHIP_CONFLICT")
	case install.Status == constant.StatusUnknown:
		out.Reasons = append(out.Reasons, "INSTALL_OUTCOME_NOT_RECONCILED")
	case missing > 0:
		out.Classification = appEvidencePartial
		out.Reasons = append(out.Reasons, "EXPECTED_CONTAINER_MISSING")
	case install.Status == constant.StatusRunning && nonRunning > 0:
		out.Classification = appEvidencePartial
		out.Reasons = append(out.Reasons, "CONTAINER_NOT_RUNNING")
	case install.Status == constant.StatusRunning && out.TaskStatus == constant.StatusSuccess && !ownershipUnproven:
		out.Classification = appEvidenceConsistent
		out.Reasons = append(out.Reasons, "RECORDS_AND_RUNNING_CONTAINERS_AGREE")
	default:
		out.Reasons = append(out.Reasons, "INSUFFICIENT_OUTCOME_EVIDENCE")
	}
	// Even CONSISTENT is only current metadata/container agreement, not
	// verified application readiness, health, storage, or installation owner.
	return out, nil
}
