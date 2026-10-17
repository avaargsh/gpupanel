package hostops

import (
	"errors"
	"os"
	"os/user"
	"path/filepath"
	"regexp"
	"strconv"
	"syscall"
)

// LinuxPrincipalPreflight is a read-only suitability result, not a grant.
// In particular, a valid OS UID has NOT been mapped to a Core Session or
// Workspace Intent, and the privileged Agent must never impersonate it.
type LinuxPrincipalPreflight struct {
	UID                 int64  `json:"uid"`
	State               string `json:"state"`
	RequirementsMet     bool   `json:"requirementsMet"`
	ExecutionAuthorized bool   `json:"executionAuthorized"`
	Blocker             string `json:"blocker"`
}

type principalFacts struct {
	UID           int64
	Username      string
	Home          string
	HomeUID       uint32
	HomeMode      os.FileMode
	HomeIsDir     bool
	HomeIsSymlink bool
	ParentUID     uint32
	ParentMode    os.FileMode
	ParentIsDir   bool
	ParentIsLink  bool
	Runtime       string
	RuntimeUID    uint32
	RuntimeMode   os.FileMode
	RuntimeIsDir  bool
	RuntimeIsLink bool
}

var ubuntuLocalAccount = regexp.MustCompile(`^[a-z_][a-z0-9_-]{0,31}$`)

func principalRejected(uid int64, reason string) LinuxPrincipalPreflight {
	return LinuxPrincipalPreflight{
		UID: uid, State: "CandidateRejected", Blocker: reason,
		RequirementsMet: false, ExecutionAuthorized: false,
	}
}

// assessLinuxPrincipal is pure and has no filesystem or DB mutation. It
// intentionally accepts only the conventional Ubuntu /home/<username>
// layout for the first local desktop slice, not every valid Linux account.
func assessLinuxPrincipal(f principalFacts) LinuxPrincipalPreflight {
	if f.UID < 1000 || f.UID > 60000 || !ubuntuLocalAccount.MatchString(f.Username) {
		return principalRejected(f.UID, "NonLocalPrincipal")
	}
	if f.Home != filepath.Join("/home", f.Username) || f.Home == "/" ||
		f.HomeIsSymlink || !f.HomeIsDir || f.HomeUID != uint32(f.UID) ||
		f.HomeMode.Perm()&0o022 != 0 {
		return principalRejected(f.UID, "UnsafeHome")
	}
	if !f.ParentIsDir || f.ParentIsLink || f.ParentUID != 0 ||
		f.ParentMode.Perm()&0o022 != 0 {
		return principalRejected(f.UID, "UnsafeHomeParent")
	}
	if f.Runtime != filepath.Join("/run/user", strconv.FormatInt(f.UID, 10)) ||
		!f.RuntimeIsDir || f.RuntimeIsLink || f.RuntimeUID != uint32(f.UID) ||
		f.RuntimeMode.Perm()&0o077 != 0 {
		return principalRejected(f.UID, "UserSessionUnavailable")
	}
	// Passing all local observations does not bind a web session to this
	// principal and does not confer any ability to invoke a Worker.
	return LinuxPrincipalPreflight{
		UID: f.UID, State: "CandidateUnbound", RequirementsMet: true,
		ExecutionAuthorized: false, Blocker: "CoreOSPrincipalBindingRequired",
	}
}

func fileFacts(path string) (uint32, os.FileMode, bool, bool, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return 0, 0, false, false, err
	}
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return 0, 0, false, false, errors.New("unsupported OS file identity")
	}
	return stat.Uid, info.Mode(), info.IsDir(), info.Mode()&os.ModeSymlink != 0, nil
}

// InspectLinuxPrincipal is a bounded, read-only Linux suitability check.
// Never call setuid/seteuid/sudo, create runtime directories, open user
// content or trust client-supplied user names or HOME environment variables.
func InspectLinuxPrincipal(uid int64) LinuxPrincipalPreflight {
	if uid < 1000 || uid > 60000 {
		return principalRejected(uid, "NonLocalPrincipal")
	}
	account, err := user.LookupId(strconv.FormatInt(uid, 10))
	if err != nil {
		return principalRejected(uid, "PrincipalUnavailable")
	}
	if account.Uid != strconv.FormatInt(uid, 10) || !ubuntuLocalAccount.MatchString(account.Username) {
		return principalRejected(uid, "NonLocalPrincipal")
	}
	parent := "/home"
	runtime := filepath.Join("/run/user", strconv.FormatInt(uid, 10))
	homeUID, homeMode, homeDir, homeLink, homeErr := fileFacts(account.HomeDir)
	if homeErr != nil {
		return principalRejected(uid, "UnsafeHome")
	}
	parentUID, parentMode, parentDir, parentLink, parentErr := fileFacts(parent)
	if parentErr != nil {
		return principalRejected(uid, "UnsafeHomeParent")
	}
	runtimeUID, runtimeMode, runtimeDir, runtimeLink, runtimeErr := fileFacts(runtime)
	if runtimeErr != nil {
		return principalRejected(uid, "UserSessionUnavailable")
	}
	return assessLinuxPrincipal(principalFacts{
		UID: uid, Username: account.Username, Home: account.HomeDir,
		HomeUID: homeUID, HomeMode: homeMode, HomeIsDir: homeDir, HomeIsSymlink: homeLink,
		ParentUID: parentUID, ParentMode: parentMode, ParentIsDir: parentDir, ParentIsLink: parentLink,
		Runtime: runtime, RuntimeUID: runtimeUID, RuntimeMode: runtimeMode,
		RuntimeIsDir: runtimeDir, RuntimeIsLink: runtimeLink,
	})
}
