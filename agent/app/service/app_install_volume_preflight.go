package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/avaargsh/GPUPanel/agent/app/model"
	"github.com/avaargsh/GPUPanel/agent/global"
	"github.com/avaargsh/GPUPanel/agent/utils/docker"
	"github.com/docker/docker/api/types/volume"
	"gorm.io/gorm"
)

// AppInstallVolumePreflight is ONE configured daemon's read-only volume
// inventory. It never proves absence of bind mounts, remote plugin state,
// other daemons, active operations, or anything that authorizes release.
type AppInstallVolumePreflight struct {
	NameKey         string    `json:"nameKey"`
	HostFingerprint string    `json:"hostFingerprint,omitempty"`
	ObservedAt      time.Time `json:"observedAt"`
	CheckedCount    int       `json:"checkedCount"`
	VolumeAbsent    bool      `json:"volumeAbsent"`
	Verified        bool      `json:"verified"`
	CanRelease      bool      `json:"canRelease"`
	Reasons         []string  `json:"reasons"`
}

type appInstallVolumeList func(context.Context) ([]*volume.Volume, []string, error)

const maxReleaseVolumeScan = 4096

var g5MachineID = regexp.MustCompile(`^[0-9a-f]{32}$`)

// observerHostFingerprint pseudonymizes the local machine-id, never returning
// the raw machine identifier. This is host correlation NOT cryptographic proof.
func observerHostFingerprint(read func(string) ([]byte, error)) (string, error) {
	if read == nil { return "", errors.New("host identity reader unavailable") }
	raw, err := read("/etc/machine-id")
	if err != nil { return "", err }
	id := strings.TrimSpace(string(raw))
	if !g5MachineID.MatchString(id) || id == strings.Repeat("0", 32) {
		return "", errors.New("malformed local machine identity")
	}
	sum := sha256.Sum256([]byte("gpupanel.g5.observer.host.v1\x00" + id))
	return hex.EncodeToString(sum[:]), nil
}

// inspectAppInstallVolumePreflight is pure apart from the injected read. An
// unlabelled volume anywhere on the daemon has ambiguous ownership because
// it may be an anonymous volume created by the original installation.
func inspectAppInstallVolumePreflight(ctx context.Context, name, hostFingerprint string, list appInstallVolumeList) (AppInstallVolumePreflight, error) {
	out := AppInstallVolumePreflight{
		ObservedAt: time.Now().UTC(), Reasons: []string{},
		Verified: false, CanRelease: false,
	}
	key, err := NormalizeAppInstallNameKey(name)
	if err != nil { return out, err }
	out.NameKey, out.HostFingerprint = key, hostFingerprint
	if ctx == nil || ctx.Err() != nil || list == nil || !regexp.MustCompile(`^[0-9a-f]{64}$`).MatchString(hostFingerprint) {
		out.Reasons = append(out.Reasons, "HOST_OR_VOLUME_OBSERVER_UNAVAILABLE")
		return out, nil
	}
	volumes, warnings, err := list(ctx)
	if err != nil || ctx.Err() != nil || len(warnings) != 0 || volumes == nil {
		out.Reasons = append(out.Reasons, "VOLUME_INVENTORY_UNAVAILABLE")
		return out, nil
	}
	if len(volumes) >= maxReleaseVolumeScan {
		out.Reasons = append(out.Reasons, "VOLUME_INVENTORY_LIMIT")
		return out, nil
	}
	out.CheckedCount = len(volumes)
	residue, ambiguous := false, false
	for _, v := range volumes {
		if v == nil || v.Name == "" {
			ambiguous = true
			continue
		}
		n := strings.ToLower(v.Name)
		project := strings.TrimSpace(v.Labels["com.docker.compose.project"])
		if strings.EqualFold(project, key) ||
			n == key || strings.HasPrefix(n, key+"_") ||
			strings.HasPrefix(n, key+"-") ||
			strings.HasPrefix(n, "1panel-"+key+"-") ||
			strings.HasPrefix(n, "gpupanel-"+key+"-") {
			residue = true
		}
		// Anonymous/unlabelled volumes cannot be conclusively attributed.
		if project == "" || v.Driver == "" || v.Driver != "local" {
			ambiguous = true
		}
	}
	if residue { out.Reasons = append(out.Reasons, "POSSIBLE_DOCKER_VOLUME_RESIDUE") }
	if ambiguous { out.Reasons = append(out.Reasons, "AMBIGUOUS_VOLUME_OWNERSHIP_OR_DRIVER") }
	if !residue && !ambiguous {
		out.VolumeAbsent = true
		out.Reasons = append(out.Reasons, "NO_MATCHING_VOLUMES_ON_OBSERVED_DAEMON")
	}
	out.Reasons = append(out.Reasons, "BIND_MOUNTS_OTHER_DAEMONS_AND_HOST_DATA_NOT_OBSERVED")
	return out, nil
}

// observerUnixSocketKind rejects configured remote Docker endpoints for the
// local-host read path. It does not authenticate the Docker daemon behind the
// socket, and can NEVER be used to mint a release permit.
func observerUnixSocketKind(endpoint string) bool {
	u, err := url.Parse(endpoint)
	return err == nil && u.Scheme == "unix" && u.Host == "" &&
		strings.HasPrefix(u.Path, "/") && !strings.Contains(u.Path, "..")
}

// inspectAgentVolumeResiduals uses the existing configured Docker endpoint.
// There is no outward API and no connection to the name release callback.
func inspectAgentVolumeResiduals(ctx context.Context, name string) (AppInstallVolumePreflight, error) {
	if ctx == nil || ctx.Err() != nil || global.DB == nil {
		return inspectAppInstallVolumePreflight(ctx, name, "", nil)
	}
	fingerprint, err := observerHostFingerprint(os.ReadFile)
	if err != nil { return inspectAppInstallVolumePreflight(ctx, name, "", nil) }
	setting := model.Setting{}
	err = global.DB.Where("key = ?", "DockerSockPath").First(&setting).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return inspectAppInstallVolumePreflight(ctx, name, fingerprint, nil)
	}
	endpoint := setting.Value
	if endpoint == "" { endpoint = "unix:///var/run/docker.sock" }
	if !observerUnixSocketKind(endpoint) {
		return inspectAppInstallVolumePreflight(ctx, name, fingerprint, nil)
	}
	cli, err := docker.NewDockerClient()
	if err != nil {
		return inspectAppInstallVolumePreflight(ctx, name, fingerprint,
			func(context.Context) ([]*volume.Volume, []string, error) { return nil, nil, err })
	}
	defer cli.Close()
	bounded, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return inspectAppInstallVolumePreflight(bounded, name, fingerprint,
		func(ctx context.Context) ([]*volume.Volume, []string, error) {
			res, err := cli.VolumeList(ctx, volume.ListOptions{})
			return res.Volumes, res.Warnings, err
		})
}
