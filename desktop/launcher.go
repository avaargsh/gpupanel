package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"
)

// A desktop-menu entry is entirely user local. It must never invoke pkexec,
// the GPUPanel Core, Docker, Kubernetes, or a shell.
const launcherFile = "gpupanel-workstation-preview.desktop"

type launcherReview struct {
	Status string `json:"status"`
	Binary string `json:"binary"`
	Target string `json:"target"`
	PlanDigest string `json:"planDigest"`
}

func safeLauncherDir(home string) (string, error) {
	if home == "" || !filepath.IsAbs(home) {
		return "", errors.New("无效 HOME")
	}
	paths := []string{filepath.Join(home, ".local"), filepath.Join(home, ".local", "share"), filepath.Join(home, ".local", "share", "applications")}
	for _, dir := range paths {
		st, err := os.Lstat(dir)
		if os.IsNotExist(err) {
			if err = os.Mkdir(dir, 0700); err != nil && !os.IsExist(err) {
				return "", err
			}
			st, err = os.Lstat(dir)
		}
		if err != nil || !st.IsDir() || st.Mode()&os.ModeSymlink != 0 {
			return "", errors.New("用户桌面配置目录不安全")
		}
	}
	return paths[len(paths)-1], nil
}

func launcherContent(binary string) (string, error) {
	if strings.ContainsAny(binary, "%\n\r\\\"") {
		return "", errors.New("不可安全编码的可执行路径")
	}
	return "[Desktop Entry]\nType=Application\nVersion=1.0\nName=GPUPanel Workstation (Preview)\nComment=User-local Ubuntu AI development workstation\nExec=\"" + binary + "\"\nTerminal=false\nCategories=Development;Utility;\nStartupNotify=true\n", nil
}

func launcherProposal(home, executable string) (launcherReview, string, error) {
	target := filepath.Join(home, ".local", "share", "applications", launcherFile)
	expected := filepath.Join(home, "GPUPanel", "desktop-preview", "bin", "gpupanel-desktop")
	if executable != expected || home == "" || !filepath.IsAbs(home) {
		return launcherReview{Status: "UNSUPPORTED_LOCATION", Binary: executable, Target: target}, "", nil
	}
	for _, dir := range []string{filepath.Join(home, "GPUPanel"), filepath.Join(home, "GPUPanel", "desktop-preview"), filepath.Join(home, "GPUPanel", "desktop-preview", "bin")} {
		st, err := os.Lstat(dir)
		if err != nil || !st.IsDir() || st.Mode()&os.ModeSymlink != 0 {
			return launcherReview{}, "", errors.New("预览二进制所在目录无效或为软链接")
		}
	}
	st, err := os.Lstat(executable)
	if err != nil || !st.Mode().IsRegular() || st.Mode().Perm()&0111 == 0 {
		return launcherReview{}, "", errors.New("无法验证本地预览可执行程序")
	}
	content, err := launcherContent(executable)
	if err != nil { return launcherReview{}, "", err }
	sum := sha256.Sum256([]byte(target + "\n" + content))
	return launcherReview{Status: "READY_FOR_APPROVAL", Binary: executable, Target: target, PlanDigest: hex.EncodeToString(sum[:])}, content, nil
}

func (s *DesktopService) LauncherPlan() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil { return "", err }
	executable, err := os.Executable()
	if err != nil { return "", err }
	review, _, err := launcherProposal(home, executable)
	if err != nil { return "", err }
	receipt, err := json.Marshal(review)
	return string(receipt), err
}

func (s *DesktopService) LauncherInstall(approved string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil { return "", err }
	executable, err := os.Executable()
	if err != nil { return "", err }
	review, content, err := launcherProposal(home, executable)
	if err != nil { return "", err }
	if review.Status != "READY_FOR_APPROVAL" || len(approved) != 64 || approved != review.PlanDigest {
		return "", errors.New("桌面入口位置/摘要未批准或已变化")
	}
	dir, err := safeLauncherDir(home)
	if err != nil { return "", err }
	target := filepath.Join(dir, launcherFile)
	fd, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL|syscall.O_NOFOLLOW, 0644)
	if err != nil {
		if os.IsExist(err) { return "", errors.New("桌面入口已存在，拒绝覆盖") }
		return "", fmt.Errorf("创建桌面入口失败：%w", err)
	}
	f := fd
	if _, err := f.WriteString(content); err != nil { f.Close(); return "", err }
	if err := f.Sync(); err != nil { f.Close(); return "", err }
	if err := f.Close(); err != nil { return "", err }
	receipt, err := json.Marshal(map[string]any{"status":"VERIFIED","target":target,"requiresDocker":false,"requiresCore":false})
	return string(receipt), err
}
