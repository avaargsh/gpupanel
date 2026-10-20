package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
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
	BinarySHA256 string `json:"binarySHA256"`
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

// Pin the executable's bytes into the user's desktop-menu approval. A fixed
// path alone cannot distinguish a reviewed preview from a replaced binary.
func executableSHA256(path string) (string, error) {
	info, err := os.Lstat(path)
	if err != nil { return "", err }
	if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 ||
		info.Mode().Perm()&0111 == 0 || info.Size() < 1 ||
		info.Size() > 250*1024*1024 {
		return "", errors.New("桌面可执行文件无效、软链接或超出大小限制")
	}
	file, err := os.Open(path)
	if err != nil { return "", err }
	defer file.Close()
	h := sha256.New()
	count, err := io.Copy(h, io.LimitReader(file, 250*1024*1024+1))
	if err != nil || count != info.Size() || count > 250*1024*1024 {
		return "", errors.New("计算桌面程序校验和失败")
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func launcherProposal(home, executable string) (launcherReview, string, error) {
	target := filepath.Join(home, ".local", "share", "applications", launcherFile)
	expected := filepath.Join(home, "GPUPanel", "desktop-preview", "bin", "gpupanel-desktop")
	if executable != expected || home == "" || !filepath.IsAbs(home) {
		return launcherReview{Status: "UNSUPPORTED_LOCATION", Binary: executable, Target: target}, "", nil
	}
	for _, dir := range []string{home, filepath.Join(home, "GPUPanel"),
		filepath.Join(home, "GPUPanel", "desktop-preview"),
		filepath.Join(home, "GPUPanel", "desktop-preview", "bin")} {
		st, err := os.Lstat(dir)
		if err != nil || !st.IsDir() || st.Mode()&os.ModeSymlink != 0 {
			return launcherReview{}, "", errors.New("预览二进制所在目录无效或为软链接")
		}
	}
	binaryHash, err := executableSHA256(executable)
	if err != nil { return launcherReview{}, "", err }
	review := launcherReview{
		Status: "READY_FOR_APPROVAL", Binary: executable,
		Target: target, BinarySHA256: binaryHash,
	}
	if _, err := os.Lstat(target); err == nil {
		review.Status = "EXISTS_NO_OVERWRITE"
		return review, "", nil
	} else if !os.IsNotExist(err) {
		return launcherReview{}, "", err
	}
	content, err := launcherContent(executable)
	if err != nil { return launcherReview{}, "", err }
	// Bind both the menu-file contents and the actual executable bytes to
	// the user's confirmation; a changed binary requires a new preview.
	sum := sha256.Sum256([]byte(target + "\n" + binaryHash + "\n" + content))
	review.PlanDigest = hex.EncodeToString(sum[:])
	return review, content, nil
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
	return installLauncher(home, executable, approved)
}

func installLauncher(home, executable, approved string) (string, error) {
	review, content, err := launcherProposal(home, executable)
	if err != nil { return "", err }
	if review.Status != "READY_FOR_APPROVAL" || len(approved) != 64 || approved != review.PlanDigest {
		return "", errors.New("桌面入口位置/摘要未批准或已变化")
	}
	dir, err := safeLauncherDir(home)
	if err != nil { return "", err }
	// Parent directory setup may take time. Revalidate the executable again
	// immediately before publishing the menu entry.
	if current, err := executableSHA256(executable); err != nil || current != review.BinarySHA256 {
		return "", errors.New("桌面可执行文件已变化；必须重新审核")
	}
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
