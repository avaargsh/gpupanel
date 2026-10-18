package hostops

import (
    "encoding/json"
    "errors"
    "fmt"

    "github.com/docker/docker/api/types"
)

// snapshotContainerState binds a plan to one exact Docker ID and its inspected
// process state, not a container name (which may be reused after removal).
// It includes timestamps/PID to reject stale previews and paused/restarting state.
func snapshotContainerState(info types.ContainerJSON) (string, error) {
    if info.State == nil || info.HostConfig == nil {
        return "", errors.New("container inspection lacks process or host state")
    }
    identity := struct {
        ID string `json:"id"`
        Status string `json:"status"`
        Running bool `json:"running"`
        Paused bool `json:"paused"`
        Restarting bool `json:"restarting"`
        PID int `json:"pid"`
        StartedAt string `json:"startedAt"`
        FinishedAt string `json:"finishedAt"`
        AutoRemove bool `json:"autoRemove"`
    }{
        ID: info.ID, Status: info.State.Status, Running: info.State.Running,
        Paused: info.State.Paused, Restarting: info.State.Restarting,
        PID: info.State.Pid, StartedAt: info.State.StartedAt,
        FinishedAt: info.State.FinishedAt, AutoRemove: info.HostConfig.AutoRemove,
    }
    encoded, err := json.Marshal(identity)
    return string(encoded), err
}

func checkContainerTransition(kind, target string, info types.ContainerJSON) error {
    if !fullContainerID.MatchString(target) || info.ID != target ||
        info.State == nil || info.HostConfig == nil || info.HostConfig.AutoRemove ||
        info.State.Paused || info.State.Restarting {
        return errors.New("container identity or state is not eligible for a local operation")
    }
    switch kind {
    case Start:
        if info.State.Running || (info.State.Status != "exited" && info.State.Status != "created") {
            return errors.New("start requires an exited or created container")
        }
    case Stop:
        if !info.State.Running || info.State.Status != "running" {
            return errors.New("stop requires a running container")
        }
    default:
        return fmt.Errorf("unsupported transition %q", kind)
    }
    return nil
}

func observedContainerTransition(kind string, before, after types.ContainerJSON) bool {
    if before.ID == "" || before.ID != after.ID || before.State == nil || after.State == nil {
        return false
    }
    switch kind {
    case Start:
        return after.State.Status == "running" && after.State.Running &&
            !after.State.Paused && !after.State.Restarting &&
            after.State.StartedAt != "" && after.State.StartedAt != before.State.StartedAt
    case Stop:
        return after.State.Status == "exited" && !after.State.Running &&
            !after.State.Paused && !after.State.Restarting &&
            after.State.FinishedAt != "" && after.State.FinishedAt != before.State.FinishedAt
    }
    return false
}
