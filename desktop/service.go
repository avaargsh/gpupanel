package main

import (
	"errors"
	"encoding/json"
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

// A denied/declined Polkit prompt intentionally exits nonzero in the Python
// CLI. Preserve the structured refusal rather than turning it into a generic
// Wails exception that suggests apt might have executed. Any unknown outcome
// requires independent reconciliation; never claim success from a nonzero
// subprocess or a malformed receipt.
func normalizeAptReceipt(output string, processErr error) (string, error) {
	var receipt struct {
		Status string `json:"status"`
		Executed *bool `json:"executed"`
		ReconciliationRequired *bool `json:"reconciliationRequired"`
	}
	if err := json.Unmarshal([]byte(output), &receipt); err != nil {
		return "", errors.New("安装操作未返回可信状态；请独立核对 dpkg 与 apt 日志")
	}
	if receipt.Executed == nil {
		return "", errors.New("安装结果缺失执行状态；需人工核对")
	}
	switch receipt.Status {
	case "AUTH_CANCELLED", "AUTH_NOT_GRANTED", "POLKIT_UNAVAILABLE",
		"ROOT_REFUSED", "REFUSED_PLAN_MISMATCH":
		if *receipt.Executed { return "", errors.New("拒绝状态与执行回执矛盾") }
		return output, nil
	case "UNKNOWN":
		if !*receipt.Executed || receipt.ReconciliationRequired == nil ||
			!*receipt.ReconciliationRequired {
			return "", errors.New("安装结果未知且缺少对账声明")
		}
		return output, nil
	case "VERIFIED":
		if processErr != nil || !*receipt.Executed || receipt.ReconciliationRequired == nil ||
			*receipt.ReconciliationRequired {
			return "", errors.New("安装成功声明未能独立确认")
		}
		return output, nil
	default:
		return "", errors.New("安装回执状态不可识别；不得自动重试")
	}
}

func (s *DesktopService) InstallPackages(planDigest string) (string, error) {
	if !digestPattern.MatchString(planDigest) {
		return "", errors.New("安装计划摘要无效")
	}
	output, err := runProfile(260*time.Second, "install", "--approve-digest", planDigest)
	return normalizeAptReceipt(output, err)
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

