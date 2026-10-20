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
	"time"
)

var bundleFilePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{0,63}-scaffold\.zip$`)

// backupsDir is private to the current desktop user. Never follow a linked
// directory into an unrelated path.
func backupsDir(create bool) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	for _, dir := range []string{filepath.Join(home, "GPUPanel"),
		filepath.Join(home, "GPUPanel", "backups")} {
		info, err := os.Lstat(dir)
		if errors.Is(err, os.ErrNotExist) && create {
			if err = os.Mkdir(dir, 0700); err != nil {
				return "", err
			}
			info, err = os.Lstat(dir)
		}
		if err != nil || !info.IsDir() {
			return "", errors.New("备份目录不存在或不安全")
		}
	}
	return filepath.Join(home, "GPUPanel", "backups"), nil
}

func runWorkspaceBundle(timeout time.Duration, args ...string) (string, error) {
	if runtime.GOOS != "linux" {
		return "", errors.New("工作区备份当前只支持 Linux")
	}
	source, err := sourceScript()
	if err != nil {
		return "", err
	}
	script := filepath.Join(filepath.Dir(source), "gpupanel-workspace-bundle.py")
	info, err := os.Lstat(script)
	if err != nil || !info.Mode().IsRegular() {
		return "", errors.New("工作区 Bundle 执行器不存在")
	}
	python, err := exec.LookPath("python3")
	if err != nil {
		return "", errors.New("未找到 Python 3")
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, python, append([]string{script}, args...)...)
	cmd.Env = []string{"HOME=" + os.Getenv("HOME"), "PATH=" + os.Getenv("PATH"), "LANG=C.UTF-8"}
	data, err := cmd.Output()
	if ctx.Err() != nil {
		return "", errors.New("Bundle 操作超时，需检查目标文件后再决定下一步")
	}
	if len(data) > 64*1024 {
		return "", errors.New("Bundle 回执超过限制")
	}
	if err != nil {
		return string(data), fmt.Errorf("Bundle 操作未完成：%w", err)
	}
	return string(data), nil
}

func (s *DesktopService) BundleExport(projectName string) (string, error) {
	if !projectPattern.MatchString(projectName) {
		return "", errors.New("无效项目名称")
	}
	root, err := backupsDir(true)
	if err != nil {
		return "", err
	}
	return runWorkspaceBundle(60*time.Second, "export", projectName,
		filepath.Join(root, projectName+"-scaffold.zip"))
}

func (s *DesktopService) BundleInspect(filename string) (string, error) {
	if !bundleFilePattern.MatchString(filename) {
		return "", errors.New("只能读取预期格式的本地 Bundle 文件名")
	}
	root, err := backupsDir(false)
	if err != nil {
		return "", err
	}
	return runWorkspaceBundle(30*time.Second, "inspect", filepath.Join(root, filename))
}

func (s *DesktopService) BundleRestore(filename, approvedDigest string) (string, error) {
	if !bundleFilePattern.MatchString(filename) || !digestPattern.MatchString(approvedDigest) {
		return "", errors.New("恢复文件名或摘要无效")
	}
	root, err := backupsDir(false)
	if err != nil {
		return "", err
	}
	return runWorkspaceBundle(60*time.Second, "restore",
		filepath.Join(root, filename), "--approve-digest", approvedDigest)
}
