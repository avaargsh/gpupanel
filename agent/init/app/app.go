package app

import (
	"github.com/avaargsh/GPUPanel/agent/utils/docker"
)

func Init() {
	go func() {
		_ = docker.CreateDefaultDockerNetwork()
	}()
}
