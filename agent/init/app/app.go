package app

import (
	"github.com/avaargsh/GPUPanel/agent/global"
	"github.com/avaargsh/GPUPanel/agent/utils/docker"
)

func Init() {
	if !global.AutoProvisionEnabled() {
		return
	}
	go func() {
		_ = docker.CreateDefaultDockerNetwork()
	}()
}
