package main

import (
	"encoding/json"
	"errors"
	"time"
)

// Reuse the existing offline uv-native starter rather than introducing a
// second project templating engine. It never invokes Docker, Core or K8s.
type uvProjectReceipt struct {
	Status string `json:"status"`
	PlanDigest string `json:"planDigest"`
	Target string `json:"target"`
	Executed bool `json:"executed"`
}

func uvProjectCall(timeout time.Duration, verb string, approve bool) (string, uvProjectReceipt, error) {
	args := []string{verb, "--json"}
	if approve {
		args = append(args, "--approve")
	}
	output, err := runEmbeddedPython(timeout, "gpupanel-uv-project.py", args...)
	var record uvProjectReceipt
	if json.Unmarshal([]byte(output), &record) != nil || record.Status == "" {
		return "", record, errors.New("项目生成器未返回可信 JSON 回执")
	}
	// Nonzero Python status can be a bounded, safe refusal: surface it as
	// data while retaining status, without pretending an install happened.
	switch record.Status {
	case "READY_FOR_APPROVAL", "MISSING_UV", "REFUSED_EXISTS",
		"PYTHON_UNAVAILABLE", "APPROVAL_REQUIRED", "VERIFIED", "MODIFIED",
		"ABSENT", "UNMANAGED", "UV_TIMEOUT", "UV_UNAVAILABLE", "UV_FAILED",
		"INVALID_TEMPLATE", "PUBLISHED_UNVERIFIED", "UNSUPPORTED_USER":
		return output, record, nil
	default:
		if err != nil {
			return "", record, err
		}
		return "", record, errors.New("无法识别项目状态")
	}
}

func (s *DesktopService) UvProjectPlan() (string, error) {
	output, _, err := uvProjectCall(15*time.Second, "plan", false)
	return output, err
}

func (s *DesktopService) UvProjectStatus() (string, error) {
	output, _, err := uvProjectCall(15*time.Second, "status", false)
	return output, err
}

func (s *DesktopService) UvProjectCreate(approvedDigest string) (string, error) {
	if !digestPattern.MatchString(approvedDigest) {
		return "", errors.New("离线项目计划摘要无效")
	}
	_, review, err := uvProjectCall(15*time.Second, "plan", false)
	if err != nil { return "", err }
	if review.Status != "READY_FOR_APPROVAL" || review.PlanDigest != approvedDigest {
		return "", errors.New("项目创建计划变化、缺少 uv 或目录已存在，拒绝继续")
	}
	result, _, err := uvProjectCall(150*time.Second, "create", true)
	return result, err
}
