package main

import (
	"encoding/json"
	"errors"
	"path/filepath"
	"regexp"
	"time"
)

// Source snapshots intentionally exclude binary data, secrets, hidden runtime
// directories, Git history and dependency caches. This is not a full backup.
var sourceBundlePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{0,63}-source-v1\.zip$`)

func runSourceSnapshot(timeout time.Duration, args ...string) (string, error) {
	return runEmbeddedPython(timeout, "gpupanel-source-snapshot.py", args...)
}

func (s *DesktopService) SourcePlan(projectName string) (string, error) {
	if !projectPattern.MatchString(projectName) {
		return "", errors.New("无效的源码项目名称")
	}
	return runSourceSnapshot(50*time.Second, "plan", projectName)
}

func (s *DesktopService) SourceExport(projectName, approvedDigest string) (string, error) {
	if !projectPattern.MatchString(projectName) || !digestPattern.MatchString(approvedDigest) {
		return "", errors.New("源码快照项目名称或批准摘要无效")
	}
	// No destination folders may be created until Go rechecks the current
	// manifest SHA. Python independently checks it again before ZIP creation.
	current, err := s.SourcePlan(projectName)
	if err != nil { return "", err }
	var review struct {
		Status string `json:"status"`
		Digest string `json:"manifestDigest"`
	}
	if json.Unmarshal([]byte(current), &review) != nil ||
		review.Status != "READY_FOR_APPROVAL" || review.Digest != approvedDigest {
		return "", errors.New("源码清单变化或审批摘要不匹配：拒绝导出")
	}
	dir, err := backupsDir(true)
	if err != nil { return "", err }
	return runSourceSnapshot(110*time.Second, "export", projectName,
		filepath.Join(dir, projectName+"-source-v1.zip"),
		"--approve-digest", approvedDigest)
}

func (s *DesktopService) SourceInspect(filename string) (string, error) {
	if !sourceBundlePattern.MatchString(filename) {
		return "", errors.New("只能检查规范的本地源码快照文件名")
	}
	dir, err := backupsDir(false)
	if err != nil { return "", err }
	return runSourceSnapshot(60*time.Second, "inspect", filepath.Join(dir, filename))
}

func (s *DesktopService) SourceRestore(filename, approvedDigest string) (string, error) {
	if !sourceBundlePattern.MatchString(filename) || !digestPattern.MatchString(approvedDigest) {
		return "", errors.New("快照文件名或恢复批准摘要无效")
	}
	dir, err := backupsDir(false)
	if err != nil { return "", err }
	return runSourceSnapshot(120*time.Second, "restore", filepath.Join(dir, filename),
		"--approve-digest", approvedDigest)
}
