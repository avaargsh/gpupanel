package main

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

// The desktop binary carries its audited user-local tools. Extract per operation
// into a private transient directory and remove after use. It does not need a
// repository checkout, GPUPanel Core, Agent, Docker or Kubernetes.
//
//go:embed runtime/scripts/* runtime/profiles/*
var embeddedTools embed.FS

func embeddedPythonEnv() []string {
	keys := []string{
		"HOME", "PATH", "LANG", "LC_ALL", "DISPLAY", "WAYLAND_DISPLAY",
		"XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS", "XAUTHORITY",
	}
	env := make([]string, 0, len(keys)+2)
	for _, key := range keys {
		if v, ok := os.LookupEnv(key); ok {
			env = append(env, key+"="+v)
		}
	}
	return append(env, "PYTHONNOUSERSITE=1", "PYTHONDONTWRITEBYTECODE=1")
}

func runEmbeddedPython(timeout time.Duration, script string, args ...string) (string, error) {
	if runtime.GOOS != "linux" {
		return "", errors.New("桌面预览当前仅支持 Ubuntu Linux")
	}
	switch script {
	case "gpupanel-workstation.py", "gpupanel-workspace-bundle.py", "gpupanel-uv-project.py", "gpupanel-uv-distribution.py":
	default:
		return "", errors.New("执行器不在允许列表")
	}
	python, err := exec.LookPath("python3")
	if err != nil {
		return "", errors.New("未检测到 Python 3；原生终端和 IDE 仍可独立使用")
	}
	stage, err := os.MkdirTemp("", "gpupanel-desktop-operation-")
	if err != nil {
		return "", errors.New("无法建立用户私有临时运行目录")
	}
	defer os.RemoveAll(stage)

	embeddedPaths := []string{"runtime/scripts/" + script, "runtime/profiles/ubuntu24-workstation.v1.json"}
	if script == "gpupanel-uv-project.py" {
		// Reuse the reviewed catalog workspace path guard and its validator.
		// These files are code, not downloaded manifests or executable recipes.
		embeddedPaths = append(embeddedPaths, "runtime/scripts/gpupanel-catalog-workspace.py", "runtime/scripts/gpupanel-catalog.py")
	}
	for _, item := range embeddedPaths {
		data, err := embeddedTools.ReadFile(item)
		if err != nil {
			return "", fmt.Errorf("内嵌资源不存在：%w", err)
		}
		target := filepath.Join(stage, item[len("runtime/"):])
		if err := os.MkdirAll(filepath.Dir(target), 0700); err != nil {
			return "", err
		}
		if err := os.WriteFile(target, data, 0600); err != nil {
			return "", err
		}
	}
	scriptPath := filepath.Join(stage, "scripts", script)
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, python, append([]string{"-I", scriptPath}, args...)...)
	cmd.Dir = stage
	cmd.Env = embeddedPythonEnv()
	output, err := cmd.Output()
	if ctx.Err() != nil {
		return "", errors.New("执行超时，状态 UNKNOWN；请独立观察主机或备份目标后再决定是否重试")
	}
	if len(output) > 64*1024 {
		return "", errors.New("子进程回执超过限制")
	}
	if err != nil {
		return string(output), fmt.Errorf("本地操作被拒绝或失败：%w", err)
	}
	return string(output), nil
}
