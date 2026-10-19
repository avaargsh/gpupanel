package service

import (
	"context"
	"strings"
	"time"

	"github.com/avaargsh/GPUPanel/agent/utils/docker"
	"github.com/docker/docker/api/types/container"
)

// AppInstallDockerPreflight reports only a current Docker-container view.
// It is NOT the resource-release probe: named/anonymous volumes, alternate
// Docker daemons, host filesystem paths and active operations are unobserved.
// It cannot supply any approval or be converted to CanRelease.
type AppInstallDockerPreflight struct {
	NameKey       string    `json:"nameKey"`
	ObservedAt    time.Time `json:"observedAt"`
	DockerAbsent  bool      `json:"dockerAbsent"`
	Verified      bool      `json:"verified"`
	CanRelease    bool      `json:"canRelease"`
	Reasons       []string  `json:"reasons"`
	CheckedCount  int       `json:"checkedCount"`
}

type appInstallContainerList func() ([]container.Summary, error)

const maxReleaseDockerScan = 4096

// inspectAppInstallDockerPreflight never silently treats Docker query
// failures, unlabeled/ambiguous containers, or truncated scans as absence.
// An unrelated compose project with an explicit different identity is not a
// match, but any unlabelled container is ambiguous without AppDB ownership.
func inspectAppInstallDockerPreflight(
	ctx context.Context, name string, list appInstallContainerList,
) (AppInstallDockerPreflight, error) {
	out := AppInstallDockerPreflight{
		ObservedAt: time.Now().UTC(), Reasons: []string{},
		Verified: false, CanRelease: false,
	}
	key, err := NormalizeAppInstallNameKey(name)
	if err != nil {
		return out, err
	}
	out.NameKey = key
	// A valid caller context and a successful Docker query are mandatory.
	if ctx == nil || ctx.Err() != nil || list == nil {
		out.Reasons = append(out.Reasons, "DOCKER_OBSERVER_UNAVAILABLE")
		return out, nil
	}
	containers, err := list()
	if err != nil || ctx.Err() != nil {
		out.Reasons = append(out.Reasons, "DOCKER_OBSERVATION_FAILED")
		return out, nil
	}
	if len(containers) >= maxReleaseDockerScan {
		out.Reasons = append(out.Reasons, "DOCKER_CONTAINER_SCAN_LIMIT")
		return out, nil
	}
	out.CheckedCount = len(containers)
	possibleResidue := false
	ambiguousOwnership := false
	for _, item := range containers {
		project, hasComposeLabel := item.Labels["com.docker.compose.project"]
		if hasComposeLabel && strings.EqualFold(strings.TrimSpace(project), key) {
			possibleResidue = true
		}
		// A matching Docker name is meaningful even without a Compose
		// label. Do not rely on a substring match for unrelated names.
		for _, raw := range item.Names {
			n := strings.ToLower(strings.TrimPrefix(raw, "/"))
			if n == key || strings.HasPrefix(n, key+"-") ||
				strings.HasPrefix(n, "1panel-"+key+"-") ||
				strings.HasPrefix(n, "gpupanel-"+key+"-") {
				possibleResidue = true
			}
		}
		// Containers without a provable, nonempty Compose project name
		// cannot safely be classified as belonging to somebody else.
		if !hasComposeLabel || strings.TrimSpace(project) == "" {
			ambiguousOwnership = true
		}
	}
	if possibleResidue {
		out.Reasons = append(out.Reasons, "POSSIBLE_CONTAINER_OR_COMPOSE_RESIDUE")
	}
	if ambiguousOwnership {
		out.Reasons = append(out.Reasons, "AMBIGUOUS_CONTAINER_OWNERSHIP")
	}
	if !possibleResidue && !ambiguousOwnership {
		// A successful complete view of *this Docker daemon's
		// containers only*. Not proof of volume/host path cleanup.
		out.DockerAbsent = true
		out.Reasons = append(out.Reasons, "NO_MATCHING_CONTAINERS_ON_OBSERVED_DAEMON")
	}
	out.Reasons = append(out.Reasons, "DOCKER_VOLUMES_AND_HOST_FILESYSTEM_NOT_OBSERVED")
	return out, nil
}

// inspectAgentDockerNameResiduals uses the Agent's configured Docker client
// and only its ListAllContainers (read-only) capability. It is intentionally
// internal, not an HTTP endpoint and not wired to any release callback.
func inspectAgentDockerNameResiduals(ctx context.Context, name string) (AppInstallDockerPreflight, error) {
	if ctx == nil || ctx.Err() != nil {
		return inspectAppInstallDockerPreflight(ctx, name, nil)
	}
	cli, err := docker.NewClient()
	if err != nil {
		return inspectAppInstallDockerPreflight(ctx, name,
			func() ([]container.Summary, error) { return nil, err })
	}
	defer cli.Close()
	return inspectAppInstallDockerPreflight(ctx, name, cli.ListAllContainers)
}

