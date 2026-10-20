//go:build linux

package main

import (
	"errors"
	"io"
	"os"
	"os/user"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"

	"golang.org/x/sys/unix"
)

var bearerPattern = regexp.MustCompile(`^[A-Za-z0-9._~+/-]{32,256}={0,2}$`)

// readOwnedTokenFile accepts only a private regular file in the invoking
// real Ubuntu user's home. It never follows symlinks or uses CLI/env secrets.
// Token contents must never be copied to diagnostic strings.
func readOwnedTokenFile(filename string) (string, error) {
	refuse := errors.New("Codex auth token file rejected; check path, owner and mode")
	if err := userFence(); err != nil { return "", refuse }
	who, err := user.Current()
	if err != nil || !filepath.IsAbs(filename) { return "", refuse }
	home := filepath.Clean(who.HomeDir)
	clean := filepath.Clean(filename)
	rel, err := filepath.Rel(home, clean)
	if err != nil || rel == "." || rel == ".." || strings.HasPrefix(rel, "../") {
		return "", refuse
	}
	uid := uint32(os.Getuid())
	// Every intermediate directory must be under the same verified UID.
	current := home
	for _, part := range strings.Split(filepath.Dir(rel), string(filepath.Separator)) {
		if part == "." { continue }
		current = filepath.Join(current, part)
		fi, err := os.Lstat(current)
		if err != nil || !fi.IsDir() || fi.Mode()&os.ModeSymlink != 0 ||
			fi.Mode().Perm()&0o022 != 0 {
			return "", refuse
		}
		info, ok := fi.Sys().(*syscall.Stat_t)
		if !ok || info.Uid != uid { return "", refuse }
	}
	// O_NOFOLLOW protects against a final component replacement after Lstat.
	fd, err := unix.Open(clean, unix.O_RDONLY|unix.O_NOFOLLOW|unix.O_CLOEXEC|unix.O_NONBLOCK, 0)
	if err != nil { return "", refuse }
	file := os.NewFile(uintptr(fd), "private-codex-auth")
	defer file.Close()
	fi, err := file.Stat()
	if err != nil || !fi.Mode().IsRegular() || fi.Mode().Perm()&0o077 != 0 {
		return "", refuse
	}
	info, ok := fi.Sys().(*syscall.Stat_t)
	if !ok || info.Uid != uid { return "", refuse }
	data, err := io.ReadAll(io.LimitReader(file, 4096))
	if err != nil { return "", refuse }
	token := strings.TrimSuffix(string(data), "\n")
	if !bearerPattern.MatchString(token) {
		return "", refuse
	}
	// Explicitly disallow whitespace/newline, even at the end of a file.
	if strings.ContainsAny(token, "\r\n\t ") || len(token) > 256 ||
		len(token) < 32 || strconv.Itoa(os.Getuid()) != who.Uid {
		return "", refuse
	}
	return token, nil
}
