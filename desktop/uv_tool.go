package main

import (
	"encoding/json"
	"errors"
	"time"
)

type uvToolResponse struct {
	Status string `json:"status"`
	PlanDigest string `json:"planDigest"`
	Executed bool `json:"executed"`
}

func callUvTool(verb, approved string) (string, uvToolResponse, error) {
	args := []string{verb}
	if verb == "install" {
		args = append(args, "--approve-digest", approved)
	}
	result, err := runEmbeddedPython(45*time.Second, "gpupanel-uv-distribution.py", args...)
	var record uvToolResponse
	if json.Unmarshal([]byte(result), &record) != nil || record.Status == "" {
		if err != nil { return "", record, err }
		return "", record, errors.New("uv 安装器回执不可识别")
	}
	switch record.Status {
	case "READY_FOR_APPROVAL", "MISSING_ARCHIVE", "UNTRUSTED_ARCHIVE",
		"UNSUPPORTED_OS", "ALREADY_PRESENT", "ABSENT", "VERIFIED",
		"MODIFIED", "ROOT_REFUSED", "REFUSED_PLAN_MISMATCH":
		return result, record, nil
	default:
		return "", record, errors.New("uv 安装器返回未知状态")
	}
}

func (s *DesktopService) UvToolPlan() (string, error) {
	out, _, err := callUvTool("plan", "")
	return out, err
}

func (s *DesktopService) UvToolStatus() (string, error) {
	out, _, err := callUvTool("status", "")
	return out, err
}

func (s *DesktopService) UvToolInstall(approvedDigest string) (string, error) {
	if !digestPattern.MatchString(approvedDigest) {
		return "", errors.New("uv 安装计划摘要无效")
	}
	_, review, err := callUvTool("plan", "")
	if err != nil { return "", err }
	if review.Status != "READY_FOR_APPROVAL" || review.PlanDigest != approvedDigest {
		return "", errors.New("uv 离线归档未校验、计划改变或版本已存在")
	}
	out, _, err := callUvTool("install", approvedDigest)
	return out, err
}
