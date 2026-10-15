package docker

import (
	"testing"

	"github.com/docker/docker/api/types/container"
)

func TestFilterContainersByExactNameHandlesNamelessDockerSummaries(t *testing.T) {
	in := []container.Summary{
		{ID: "nameless", Names: nil},
		{ID: "also-nameless", Names: []string{}},
		{ID: "prefix-only", Names: []string{"/gpupanel-target-foreign"}},
		{ID: "match", Names: []string{"/gpupanel-target"}},
	}
	result := filterContainersByExactName(in, map[string]bool{"/gpupanel-target": true})
	if len(result) != 1 || result[0].ID != "match" {
		t.Fatalf("expected exact match only, got: %+v", result)
	}
}

func TestFilterContainersByExactNameAcceptsNonFirstAliasOnce(t *testing.T) {
	in := []container.Summary{
		{ID: "aliased", Names: []string{"/other-name", "/gpupanel-target", "/gpupanel-secondary"}},
		{ID: "case-differs", Names: []string{"/GPUPANEL-TARGET"}},
	}
	result := filterContainersByExactName(in, map[string]bool{
		"/gpupanel-target": true, "/gpupanel-secondary": true,
	})
	if len(result) != 1 || result[0].ID != "aliased" {
		t.Fatalf("alias should be matched once, never case/substr match: %+v", result)
	}
}

func TestFilterContainersByExactNameEmptyRequestReturnsNothing(t *testing.T) {
	result := filterContainersByExactName([]container.Summary{
		{ID: "any", Names: []string{"/anything"}},
	}, map[string]bool{})
	if len(result) != 0 {
		t.Fatalf("empty target unexpectedly matched Docker resources: %+v", result)
	}
}
