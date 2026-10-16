package hostops

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/avaargsh/GPUPanel/agent/utils/ai_tools/accelerator"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
)

// Docker scope is explicit and fixed. This never follows Docker Desktop or DOCKER_HOST.
func localDocker() (*client.Client, error) {
	return client.NewClientWithOpts(client.WithHost("unix:///var/run/docker.sock"), client.WithAPIVersionNegotiation())
}

type LocalRunner struct {
	dockerClient func() (*client.Client, error)
}

func (runner LocalRunner) client() (*client.Client, error) {
	if runner.dockerClient != nil {
		return runner.dockerClient()
	}
	return localDocker()
}

func (runner LocalRunner) Prepare(ctx context.Context, kind, target string) (string, string, error) {
	switch kind {
	case Diagnose:
		return "read-only", "Read local OS, root filesystem and accelerator inventory. No system changes.", nil
	case Restart:
		cli, err := runner.client()
		if err != nil {
			return "", "", err
		}
		defer cli.Close()
		info, err := cli.ContainerInspect(ctx, target)
		if err != nil || info.ID != target || info.State == nil || !info.State.Running {
			return "", "", errors.New("select an existing running container by its full 64-character ID")
		}
		if info.HostConfig == nil || info.HostConfig.AutoRemove {
			return "", "", errors.New("auto-remove containers cannot be restarted by this workflow")
		}
		return info.State.StartedAt, fmt.Sprintf("Restart container %s (%s) on local /var/run/docker.sock. Interrupts its running processes; no automatic rollback.", info.Name, target), nil
	}
	return "", "", ErrDenied
}

func (runner LocalRunner) Execute(ctx context.Context, r Receipt) (Result, error) {
	if r.Kind == Diagnose {
		return diagnose(ctx)
	}
	if r.Kind != Restart {
		return Result{}, ErrDenied
	}
	cli, err := runner.client()
	if err != nil {
		return Result{}, err
	}
	defer cli.Close()
	before, err := cli.ContainerInspect(ctx, r.Target)
	if err != nil || before.ID != r.Target || before.State == nil || !before.State.Running || before.State.StartedAt != r.Expected || before.HostConfig == nil || before.HostConfig.AutoRemove {
		return Result{}, errors.New("container changed since preview; no restart attempted")
	}
	timeout := 5
	if err := cli.ContainerRestart(ctx, r.Target, container.StopOptions{Timeout: &timeout}); err != nil {
		return Result{Unknown: true}, errors.New("restart response uncertain; inspect container before any new operation")
	}
	// Observe separately from the restart response; do not equate HTTP success with outcome.
	for {
		observed, err := cli.ContainerInspect(ctx, r.Target)
		if err != nil {
			return Result{Unknown: true}, errors.New("restart accepted but target observation unavailable")
		}
		if observed.ID == r.Target && observed.State != nil && observed.State.Running && observed.State.StartedAt != r.Expected {
			output, _ := json.Marshal(map[string]interface{}{"id": observed.ID, "running": true, "startedAt": observed.State.StartedAt, "previousStartedAt": r.Expected})
			return Result{Verified: true, Output: string(output)}, nil
		}
		select {
		case <-ctx.Done():
			return Result{Unknown: true}, ctx.Err()
		case <-time.After(200 * time.Millisecond):
		}
	}
}

func diagnose(ctx context.Context) (Result, error) {
	h, err := host.InfoWithContext(ctx)
	if err != nil {
		return Result{}, err
	}
	d, err := disk.UsageWithContext(ctx, "/")
	if err != nil {
		return Result{}, err
	}
	// Omit serial numbers, environment, process arguments and credentials.
	report := map[string]interface{}{"hostname": h.Hostname, "os": h.OS, "platform": h.Platform, "kernelVersion": h.KernelVersion, "arch": h.KernelArch, "uptimeSeconds": h.Uptime, "rootFilesystem": map[string]interface{}{"totalBytes": d.Total, "usedBytes": d.Used, "usedPercent": d.UsedPercent}}
	available, c := accelerator.New()
	if available {
		snapshot, err := c.Collect(ctx)
		if err != nil {
			report["acceleratorStatus"] = "unavailable"
		} else {
			devices := []map[string]string{}
			for _, d := range snapshot.Devices {
				devices = append(devices, map[string]string{"name": d.Name, "vendor": d.Vendor, "pci": d.BusID})
			}
			report["accelerators"] = devices
		}
	} else {
		report["accelerators"] = []interface{}{}
	}
	data, err := json.MarshalIndent(report, "", "  ")
	return Result{Output: string(data)}, err
}
