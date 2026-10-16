package hostops

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"
)

func TestLocalDiagnoseReadsActualHost(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	result, err := (LocalRunner{}).Execute(ctx, Receipt{Kind: Diagnose, Target: "local"})
	if err != nil {
		t.Fatal(err)
	}
	var data map[string]interface{}
	if json.Unmarshal([]byte(result.Output), &data) != nil {
		t.Fatal("invalid diagnostic response")
	}
	name, _ := os.Hostname()
	if data["hostname"] != name || data["rootFilesystem"] == nil {
		t.Fatal("diagnosis did not read actual host")
	}
	if strings.Contains(result.Output, "processName") || strings.Contains(result.Output, "HostID") {
		t.Fatal("unnecessary sensitive details exposed")
	}
}

// Opt-in only; refuses everything except the exact owned, isolated test container.
func TestOwnedDockerRestartLifecycle(t *testing.T) {
	id, run := os.Getenv("GPUPANEL_HOSTOPS_CANARY"), os.Getenv("GPUPANEL_HOSTOPS_RUN")
	if id == "" || run == "" {
		t.Skip("requires explicitly owned disposable Docker canary")
	}
	if !fullContainerID.MatchString(id) {
		t.Fatal("full container ID required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	cli, err := localDocker()
	if err != nil {
		t.Fatal(err)
	}
	defer cli.Close()
	before, err := cli.ContainerInspect(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if before.ID != id || before.Config.Labels["gpupanel.hostops.acceptance"] != run || len(before.Mounts) != 0 || before.HostConfig.Privileged || before.HostConfig.NetworkMode != "none" || len(before.HostConfig.PortBindings) != 0 || before.Config.User != "65534:65534" {
		t.Fatal("foreign or insufficiently isolated container; refuse mutation")
	}
	e, _, _ := testEngine(t)
	e.Runner = LocalRunner{}
	plan, err := e.Plan(ctx, "test:session", PlanRequest{Kind: Restart, Target: id, Key: "owned-canary-restart"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e.Execute(ctx, "test:session", plan.ID, ConfirmRequest{Hash: plan.Hash, Confirm: false}); err == nil {
		t.Fatal("confirmation bypass")
	}
	unchanged, _ := cli.ContainerInspect(ctx, id)
	if unchanged.State.StartedAt != before.State.StartedAt {
		t.Fatal("preview changed container")
	}
	result, err := e.Execute(ctx, "test:session", plan.ID, ConfirmRequest{Hash: plan.Hash, Confirm: true})
	if err != nil || result.State != "verified" || !result.Verified {
		t.Fatalf("restart not verified: %+v %v", result, err)
	}
	observed, err := cli.ContainerInspect(ctx, id)
	if err != nil || !observed.State.Running || observed.State.StartedAt == before.State.StartedAt {
		t.Fatal("independent observation failed")
	}
	e.Execute(ctx, "test:session", plan.ID, ConfirmRequest{Hash: plan.Hash, Confirm: true})
	replayed, _ := cli.ContainerInspect(ctx, id)
	if replayed.State.StartedAt != observed.State.StartedAt {
		t.Fatal("confirmation replay restarted twice")
	}
	t.Log("LIVE owned Docker preview/deny/restart/observe/replay checks passed; no production container used")
}
