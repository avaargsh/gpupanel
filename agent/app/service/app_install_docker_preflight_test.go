package service

import (
	"context"
	"errors"
	"slices"
	"strings"
	"testing"

	"github.com/docker/docker/api/types/container"
)

func appPreflightContainer(name, project string) container.Summary {
	return container.Summary{
		Names:  []string{"/" + name},
		Labels: map[string]string{"com.docker.compose.project": project},
		State:  "exited",
	}
}

func TestDockerPreflightReportsOnlyDaemonContainerAbsence(t *testing.T) {
	calls := 0
	got, err := inspectAppInstallDockerPreflight(context.Background(), " Jupyter ",
		func() ([]container.Summary, error) {
			calls++
			return []container.Summary{}, nil
		})
	if err != nil { t.Fatal(err) }
	if calls != 1 || got.NameKey != "jupyter" || !got.DockerAbsent ||
		got.Verified || got.CanRelease || got.ObservedAt.IsZero() || got.CheckedCount != 0 {
		t.Fatalf("empty daemon container inventory misclassified: %+v calls=%d", got, calls)
	}
	if !slices.Contains(got.Reasons, "DOCKER_VOLUMES_AND_HOST_FILESYSTEM_NOT_OBSERVED") {
		t.Fatalf("false full resource clearance: %+v", got)
	}
}

func TestDockerPreflightSameComposeProjectRemainsBlockedEvenIfStopped(t *testing.T) {
	containers := []container.Summary{
		appPreflightContainer("external-cache", "jupyter"),
		appPreflightContainer("other-service", "other-project"),
	}
	got, err := inspectAppInstallDockerPreflight(context.Background(), "jupyter",
		func() ([]container.Summary, error) { return containers, nil })
	if err != nil { t.Fatal(err) }
	if got.DockerAbsent || got.CanRelease || got.Verified || got.CheckedCount != 2 ||
		!slices.Contains(got.Reasons, "POSSIBLE_CONTAINER_OR_COMPOSE_RESIDUE") {
		t.Fatalf("stopped matching project was treated as absent: %+v", got)
	}
}

func TestDockerPreflightMatchingContainerNameWithoutLabelDeniesClearance(t *testing.T) {
	containers := []container.Summary{
		{Names: []string{"/jupyter-01"}, Labels: nil},
	}
	got, err := inspectAppInstallDockerPreflight(context.Background(), "Jupyter",
		func() ([]container.Summary, error) { return containers, nil })
	if err != nil { t.Fatal(err) }
	if got.DockerAbsent || !slices.Contains(got.Reasons, "AMBIGUOUS_CONTAINER_OWNERSHIP") ||
		!slices.Contains(got.Reasons, "POSSIBLE_CONTAINER_OR_COMPOSE_RESIDUE") {
		t.Fatalf("unlabeled named container allowed release: %+v", got)
	}
}

func TestDockerPreflightAmbiguousUnlabeledUnrelatedContainerFailsClosed(t *testing.T) {
	got, err := inspectAppInstallDockerPreflight(context.Background(), "jupyter",
		func() ([]container.Summary, error) {
			return []container.Summary{{Names: []string{"/unrelated"}, Labels: map[string]string{}}}, nil
		})
	if err != nil { t.Fatal(err) }
	if got.DockerAbsent || got.Verified || got.CanRelease ||
		!slices.Contains(got.Reasons, "AMBIGUOUS_CONTAINER_OWNERSHIP") {
		t.Fatalf("unknown container ownership was assumed absent: %+v", got)
	}
}

func TestDockerPreflightClearlyDifferentComposeProjectIsNotSameNameResidue(t *testing.T) {
	got, err := inspectAppInstallDockerPreflight(context.Background(), "jupyter",
		func() ([]container.Summary, error) {
			return []container.Summary{appPreflightContainer("redis", "different")}, nil
		})
	if err != nil { t.Fatal(err) }
	if !got.DockerAbsent || got.CanRelease || got.Verified {
		t.Fatalf("different project or read-only state misclassified: %+v", got)
	}
}

func TestDockerPreflightQueryFailureTruncationAndCancellationBlock(t *testing.T) {
	cases := []struct {
		name string
		ctx context.Context
		list appInstallContainerList
		reason string
	}{
		{"nil observer", context.Background(), nil, "DOCKER_OBSERVER_UNAVAILABLE"},
		{"daemon down", context.Background(), func() ([]container.Summary,error) {
			return nil, errors.New("dial unix Docker: unavailable")
		}, "DOCKER_OBSERVATION_FAILED"},
		{"overlarge daemon", context.Background(), func() ([]container.Summary,error) {
			return make([]container.Summary, maxReleaseDockerScan), nil
		}, "DOCKER_CONTAINER_SCAN_LIMIT"},
	}
	canceled, cancel := context.WithCancel(context.Background())
	cancel()
	cases = append(cases, struct {
		name string
		ctx context.Context
		list appInstallContainerList
		reason string
	}{"canceled", canceled, func() ([]container.Summary,error) {
		t.Fatal("canceled query must not call Docker")
		return nil, nil
	}, "DOCKER_OBSERVER_UNAVAILABLE"})
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := inspectAppInstallDockerPreflight(tc.ctx, "jupyter", tc.list)
			if err != nil { t.Fatal(err) }
			if got.DockerAbsent || got.Verified || got.CanRelease ||
				!slices.Contains(got.Reasons, tc.reason) {
				t.Fatalf("read failure became clearance: %+v", got)
			}
		})
	}
}

func TestDockerPreflightRejectsInvalidOrOversizedNameBeforeQuery(t *testing.T) {
	for _, input := range []string{"", " ", strings.Repeat("q", 256)} {
		calls := 0
		_, err := inspectAppInstallDockerPreflight(context.Background(), input,
			func() ([]container.Summary,error) { calls++; return nil,nil })
		if !errors.Is(err, ErrAppInstallNameInvalid) || calls != 0 {
			t.Fatalf("invalid name %q inspected Docker: err=%v calls=%d", input, err, calls)
		}
	}
}

func TestDockerPreflightDetectsDockerNameEvenIfComposeLabelClaimsAnotherProject(t *testing.T) {
	got, err := inspectAppInstallDockerPreflight(context.Background(), "jupyter",
		func() ([]container.Summary,error) {
			return []container.Summary{appPreflightContainer("1panel-jupyter-stale", "different")}, nil
		})
	if err != nil {t.Fatal(err)}
	if got.DockerAbsent || !slices.Contains(got.Reasons,"POSSIBLE_CONTAINER_OR_COMPOSE_RESIDUE"){
		t.Fatalf("different Compose label masked residual name: %+v",got)
	}
}
