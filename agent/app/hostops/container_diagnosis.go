package hostops

import (
    "context"
    "encoding/json"
    "errors"
    "time"
)

// Container diagnosis deliberately uses Docker Inspect only. Docker Inspect
// contains environment variables, mount paths and command arguments: never
// serialize the Docker API object or forward Docker's error body to clients.
type containerDiagnosis struct {
    Schema string `json:"schema"`
    ContainerID string `json:"containerId"`
    ObservedAt time.Time `json:"observedAt"`
    Status string `json:"status"`
    Running bool `json:"running"`
    ExitCode int `json:"exitCode"`
    OOMKilled bool `json:"oomKilled"`
    Health string `json:"health"`
    Observation string `json:"observation"`
}

func knownDockerStatus(s string) bool {
    switch s {
    case "created", "running", "paused", "restarting", "removing", "exited", "dead":
        return true
    default:
        return false
    }
}

func safeDockerHealth(s string) string {
    switch s {
    case "starting", "healthy", "unhealthy":
        return s
    default:
        return "unknown"
    }
}

func (runner LocalRunner) diagnoseContainer(ctx context.Context, id string) (Result, error) {
    if !fullContainerID.MatchString(id) {
        return Result{}, ErrDenied
    }
    cli, err := runner.client()
    if err != nil {
        return Result{}, errors.New("local Docker observation unavailable")
    }
    defer cli.Close()

    info, err := cli.ContainerInspect(ctx, id)
    if err != nil || info.ID != id || info.State == nil || !knownDockerStatus(info.State.Status) {
        return Result{}, errors.New("container state unavailable or invalid")
    }
    if ctx.Err() != nil {
        return Result{}, errors.New("container observation interrupted")
    }

    health := "unknown"
    if info.State.Health != nil {
        health = safeDockerHealth(info.State.Health.Status)
    }
    observation := containerDiagnosis{
        Schema: "gpupanel.host.container-diagnosis.v1",
        ContainerID: id,
        ObservedAt: time.Now().UTC(),
        Status: info.State.Status,
        Running: info.State.Running,
        ExitCode: info.State.ExitCode,
        OOMKilled: info.State.OOMKilled,
        Health: health,
        Observation: "read-only-docker-inspect",
    }
    output, err := json.Marshal(observation)
    if err != nil {
        return Result{}, errors.New("container observation unavailable")
    }
    // Completed read-only observation is not a verified mutation or causal proof.
    return Result{Output: string(output), Verified: false}, nil
}
