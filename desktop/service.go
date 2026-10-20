package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
)

var digestPattern = regexp.MustCompile("^[a-f0-9]{64}$")
var projectPattern = regexp.MustCompile("^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$")

// DesktopService exposes only fixed, explicitly named user-local actions.
// It does not bridge privileged Agent/Core API or arbitrary shell commands.
type DesktopService struct{}

func sourceScript() (string, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for _, base := range []string{cwd, filepath.Dir(cwd)} {
		path := filepath.Join(base, "scripts", "gpupanel-workstation.py")
		st, err := os.Lstat(path)
		if err == nil && st.Mode().IsRegular() {
			return path, nil
		}
	}
	return "", errors.New("没有找到源码工作区；当前预览仅支持从 GPUPanel 仓库根目录或 desktop/ 启动")
}

func runProfile(timeout time.Duration, args ...string) (string, error) {
	if runtime.GOOS != "linux" {
		return "", errors.New("目前只支持 Ubuntu Linux")
	}
	path, err := sourceScript()
	if err != nil {
		return "", err
	}
	python, err := exec.LookPath("python3")
	if err != nil {
		return "", errors.New("本机未安装 Python 3")
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, python, append([]string{path}, args...)...)
	cmd.Env = []string{"HOME=" + os.Getenv("HOME"), "PATH=" + os.Getenv("PATH"), "LANG=C.UTF-8"}
	// Do not combine stderr from package installers with UI-visible output.
	output, err := cmd.Output()
	if ctx.Err() != nil {
		return "", errors.New("操作状态 UNKNOWN；请独立检查本机状态，禁止直接重试")
	}
	if len(output) > 64*1024 {
		return "", errors.New("本地工具输出超过限制")
	}
	if err != nil {
		return string(output), fmt.Errorf("本地操作未通过：%w", err)
	}
	return string(output), nil
}

func (s *DesktopService) Overview() (string, error) {
	return runProfile(20*time.Second, "doctor")
}

func (s *DesktopService) Versions() (string, error) {
	return runProfile(25*time.Second, "versions")
}

func (s *DesktopService) InstallPlan() (string, error) {
	return runProfile(20*time.Second, "install-plan")
}

func (s *DesktopService) MirrorEnvironment() (string, error) {
	return runProfile(15*time.Second, "env")
}

func (s *DesktopService) Restore(profileDigest string) (string, error) {
	if !digestPattern.MatchString(profileDigest) {
		return "", errors.New("Profile 摘要无效")
	}
	return runProfile(20*time.Second, "restore", "--approve-digest", profileDigest)
}

func (s *DesktopService) InstallPackages(planDigest string) (string, error) {
	if !digestPattern.MatchString(planDigest) {
		return "", errors.New("安装计划摘要无效")
	}
	return runProfile(260*time.Second, "install", "--approve-digest", planDigest)
}

func (s *DesktopService) DevpodPlan(projectName string) (string, error) {
	if !projectPattern.MatchString(projectName) {
		return "", errors.New("项目名称仅支持字母、数字、下划线和连字符")
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return runProfile(20*time.Second, "devpod-plan", filepath.Join(home, "GPUPanel/projects", projectName))
}

func (s *DesktopService) OpenTerminal() error {
	terminal, err := exec.LookPath("gnome-terminal")
	if err != nil {
		return errors.New("未找到 GNOME Terminal，请安装或使用系统终端")
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	return exec.Command(terminal, "--working-directory="+home).Start()
}

func (s *DesktopService) OpenEditor() error {
	var binary string
	for _, name := range []string{"code", "codium"} {
		if path, err := exec.LookPath(name); err == nil {
			binary = path
			break
		}
	}
	if binary == "" {
		return errors.New("未安装 VS Code / VSCodium，本机 IDE 是可选项")
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	path := filepath.Join(home, "GPUPanel", "projects")
	if st, err := os.Stat(path); err != nil || !st.IsDir() {
		path = home
	}
	if strings.Contains(path, "\x00") {
		return errors.New("无效目录")
	}
	return exec.Command(binary, "--new-window", path).Start()
}
