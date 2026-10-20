package main

import (
	"errors"
	"path/filepath"
	"time"
)

const portableProfileName = "workstation-profile.json"

// These methods intentionally transfer only non-secret workstation preferences.
// The imported profile is never executed: it must pass the Python schema checks
// and requires the digest from a separate explicit preview.
func (s *DesktopService) ProfileBackup() (string, error) {
	dir, err := backupsDir(true)
	if err != nil {
		return "", err
	}
	return runProfile(20*time.Second, "export", filepath.Join(dir, portableProfileName))
}

func (s *DesktopService) ProfileImportPlan() (string, error) {
	dir, err := backupsDir(false)
	if err != nil {
		return "", err
	}
	return runProfile(20*time.Second,
		"--profile", filepath.Join(dir, portableProfileName), "doctor")
}

func (s *DesktopService) ProfileImport(approvedDigest string) (string, error) {
	if !digestPattern.MatchString(approvedDigest) {
		return "", errors.New("Profile 摘要无效")
	}
	dir, err := backupsDir(false)
	if err != nil {
		return "", err
	}
	return runProfile(20*time.Second,
		"--profile", filepath.Join(dir, portableProfileName),
		"restore", "--approve-digest", approvedDigest)
}
