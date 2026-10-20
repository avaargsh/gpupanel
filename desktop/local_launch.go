package main

import (
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
)

// The only accepted target is a previously-created, ordinary project directory.
// The path is constructed by the application, never provided directly by WebView.
// Each path component is checked with Lstat to refuse symlink traversal.
func localProjectDir(home, name string) (string, error) {
	if !projectPattern.MatchString(name) || home == "" || !filepath.IsAbs(home) {
		return "", errors.New("无效项目名称或 HOME")
	}
	for _, dir := range []string{home, filepath.Join(home, "GPUPanel"),
		filepath.Join(home, "GPUPanel", "projects"),
		filepath.Join(home, "GPUPanel", "projects", name)} {
		info, err := os.Lstat(dir)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return "", errors.New("项目目录不存在；请先创建或导入工作区")
			}
			return "", err
		}
		if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return "", errors.New("项目目录不安全：软链接或非目录")
		}
	}
	return filepath.Join(home, "GPUPanel", "projects", name), nil
}

// Optional applications are never installed or executed via a shell. A start
// acknowledgement proves only OS process dispatch, not that the GUI is usable.
func startLocalProjectApp(kind, project string,
	finder func(string) (string, error),
	starter func(string, ...string) error) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	target, err := localProjectDir(home, project)
	if err != nil {
		return "", err
	}
	choices := []string{"code", "codium"}
	if kind == "terminal" {
		choices = []string{"gnome-terminal", "ptyxis"}
	} else if kind != "editor" {
		return "", errors.New("不支持的应用类型")
	}
	for _, name := range choices {
		bin, err := finder(name)
		if err != nil || !filepath.IsAbs(bin) {
			continue
		}
		var args []string
		if kind == "terminal" {
			args = []string{"--working-directory=" + target}
		} else {
			args = []string{"--new-window", target}
		}
		if err := starter(bin, args...); err != nil {
			return "", errors.New("系统未能启动所选应用；实际 GUI 状态未知")
		}
		out, err := json.Marshal(map[string]any{
			"status": "LAUNCH_REQUESTED",
			"application": name,
			"project": project,
			"directory": target,
			"verifiedGUI": false,
			"requires": map[string]bool{"docker": false, "core": false, "kubernetes": false},
		})
		return string(out), err
	}
	out, err := json.Marshal(map[string]any{
		"status": "OPTIONAL_APP_MISSING",
		"kind": kind,
		"project": project,
		"directory": target,
		"executed": false,
	})
	return string(out), err
}

func startNativeProcess(binary string, args ...string) error {
	// Launch-and-release, rather than leaving an unreaped child attached to
	// the long-running Wails process. Exit/GUI readiness remain UNKNOWN.
	cmd := exec.Command(binary, args...)
	if err := cmd.Start(); err != nil {
		return err
	}
	return cmd.Process.Release()
}

func (s *DesktopService) OpenProjectTerminal(projectName string) (string, error) {
	return startLocalProjectApp("terminal", projectName, exec.LookPath, startNativeProcess)
}

func (s *DesktopService) OpenProjectEditor(projectName string) (string, error) {
	return startLocalProjectApp("editor", projectName, exec.LookPath, startNativeProcess)
}
