package main

import (
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"time"
)

var digestPattern = regexp.MustCompile("^[a-f0-9]{64}$")
var projectPattern = regexp.MustCompile("^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$")

// DesktopService exposes only fixed, explicitly named user-local actions.
// It does not bridge privileged Agent/Core API or arbitrary shell commands.
type DesktopService struct{}

func runProfile(timeout time.Duration, args ...string) (string, error) {
	return runEmbeddedPython(timeout, "gpupanel-workstation.py", args...)
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

