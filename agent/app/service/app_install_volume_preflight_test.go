package service

import (
	"context"
	"errors"
	"slices"
	"strings"
	"testing"

	"github.com/docker/docker/api/types/volume"
)

const fixtureHostHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

func testVolume(name, project, driver string) *volume.Volume {
	return &volume.Volume{
		Name: name, Driver: driver,
		Labels: map[string]string{"com.docker.compose.project": project},
	}
}

func TestG5VolumePreflightEmptyDaemonNeverPermitsRelease(t *testing.T) {
	calls := 0
	got, err := inspectAppInstallVolumePreflight(context.Background(), "  JUPYTER ", fixtureHostHash,
		func(context.Context) ([]*volume.Volume, []string, error) {
			calls++
			return []*volume.Volume{}, nil, nil
		})
	if err != nil { t.Fatal(err) }
	if calls != 1 || !got.VolumeAbsent || got.CanRelease || got.Verified ||
		got.NameKey != "jupyter" || got.HostFingerprint != fixtureHostHash ||
		!slices.Contains(got.Reasons, "BIND_MOUNTS_OTHER_DAEMONS_AND_HOST_DATA_NOT_OBSERVED") {
		t.Fatalf("empty volume list became release proof: %+v", got)
	}
}

func TestG5VolumePreflightMatchesComposeLabelAndName(t *testing.T) {
	for _, row := range []struct{name, project string}{
		{"random-abcd", "Jupyter"},
		{"jupyter_data", "other"},
		{"gpupanel-jupyter-stale", "other"},
		{"1panel-jupyter-stale", "other"},
		{"jupyter-1", "other"},
	} {
		got, err := inspectAppInstallVolumePreflight(context.Background(), "jupyter", fixtureHostHash,
			func(context.Context) ([]*volume.Volume, []string, error) {
				return []*volume.Volume{testVolume(row.name, row.project, "local")}, nil, nil
			})
		if err != nil { t.Fatal(err) }
		if got.VolumeAbsent || got.CanRelease ||
			!slices.Contains(got.Reasons, "POSSIBLE_DOCKER_VOLUME_RESIDUE") {
			t.Fatalf("volume %q project %q became safe: %+v", row.name, row.project, got)
		}
	}
}

func TestG5VolumePreflightUnlabeledAnonymousAndOtherDriverRemainAmbiguous(t *testing.T) {
	for _, row := range []*volume.Volume{
		{Name:"randomhash",Driver:"local"},
		testVolume("unrelated", "other", "nfs"),
		nil,
	} {
		got, err := inspectAppInstallVolumePreflight(context.Background(), "jupyter", fixtureHostHash,
			func(context.Context) ([]*volume.Volume, []string, error) {
				return []*volume.Volume{row}, nil, nil
			})
		if err != nil { t.Fatal(err) }
		if got.VolumeAbsent || got.CanRelease ||
			!slices.Contains(got.Reasons, "AMBIGUOUS_VOLUME_OWNERSHIP_OR_DRIVER") {
			t.Fatalf("ambiguous volume yielded clearance: %+v", got)
		}
	}
}

func TestG5VolumePreflightDifferentProjectOnlyBoundsOneDaemon(t *testing.T) {
	got, err := inspectAppInstallVolumePreflight(context.Background(), "jupyter", fixtureHostHash,
		func(context.Context) ([]*volume.Volume, []string, error) {
			return []*volume.Volume{testVolume("unrelated", "different", "local")}, nil, nil
		})
	if err != nil { t.Fatal(err) }
	if !got.VolumeAbsent || got.CanRelease || got.Verified {
		t.Fatalf("different project was attributed to target: %+v", got)
	}
}

func TestG5VolumePreflightErrorsWarningsSaturationAndCancellation(t *testing.T) {
	canceled, cancel := context.WithCancel(context.Background()); cancel()
	cases := []struct{
		name string
		ctx context.Context
		list appInstallVolumeList
		reason string
	}{
		{"missing", context.Background(), nil, "HOST_OR_VOLUME_OBSERVER_UNAVAILABLE"},
		{"docker error", context.Background(), func(context.Context)([]*volume.Volume,[]string,error){
			return nil,nil,errors.New("unreachable")
		},"VOLUME_INVENTORY_UNAVAILABLE"},
		{"daemon warning", context.Background(), func(context.Context)([]*volume.Volume,[]string,error){
			return []*volume.Volume{},[]string{"driver unavailable"},nil
		},"VOLUME_INVENTORY_UNAVAILABLE"},
		{"nil inventory", context.Background(), func(context.Context)([]*volume.Volume,[]string,error){
			return nil,nil,nil
		},"VOLUME_INVENTORY_UNAVAILABLE"},
		{"saturated",context.Background(),func(context.Context)([]*volume.Volume,[]string,error){
			return make([]*volume.Volume,maxReleaseVolumeScan),nil,nil
		},"VOLUME_INVENTORY_LIMIT"},
		{"canceled",canceled,func(context.Context)([]*volume.Volume,[]string,error){
			t.Fatal("canceled context queried Docker")
			return nil,nil,nil
		},"HOST_OR_VOLUME_OBSERVER_UNAVAILABLE"},
	}
	for _, tc := range cases {
		t.Run(tc.name,func(t *testing.T){
			got,err:=inspectAppInstallVolumePreflight(tc.ctx,"jupyter",fixtureHostHash,tc.list)
			if err!=nil{t.Fatal(err)}
			if got.VolumeAbsent || got.CanRelease || !slices.Contains(got.Reasons,tc.reason){
				t.Fatalf("volume uncertainty treated as clearance: %+v",got)
			}
		})
	}
	got,err:=inspectAppInstallVolumePreflight(context.Background(),"jupyter","",func(context.Context)([]*volume.Volume,[]string,error){
		t.Fatal("missing host identity queried Docker")
		return nil,nil,nil
	})
	if err!=nil || got.VolumeAbsent || got.CanRelease {t.Fatalf("missing host did not fail closed: %+v %v",got,err)}
	ctx, stop := context.WithCancel(context.Background());defer stop()
	got,err=inspectAppInstallVolumePreflight(ctx,"jupyter",fixtureHostHash,func(context.Context)([]*volume.Volume,[]string,error){
		stop(); return []*volume.Volume{},nil,nil
	})
	if err!=nil || got.VolumeAbsent {t.Fatalf("midflight cancellation reported no volumes: %+v %v",got,err)}
}

func TestG5HostFingerprintPseudonymousAndSocketRestriction(t *testing.T) {
	raw := "1234567890abcdef1234567890abcdef"
	hash,err:=observerHostFingerprint(func(path string)([]byte,error){
		if path!="/etc/machine-id"{t.Fatalf("unexpected identity source: %s",path)}
		return []byte(raw+"\n"),nil
	})
	if err!=nil || len(hash)!=64 || strings.Contains(hash,raw) {t.Fatalf("raw host identity leaked: %q %v",hash,err)}
	for _, bad := range []string{"",strings.Repeat("0",32),"INVALID",strings.Repeat("a",31)} {
		if _,err:=observerHostFingerprint(func(string)([]byte,error){return []byte(bad),nil});err==nil{
			t.Fatalf("invalid machine identity accepted: %q",bad)
		}
	}
	for _, allowed := range []string{"unix:///var/run/docker.sock","unix:///run/docker.sock"}{
		if !observerUnixSocketKind(allowed){t.Fatalf("valid unix socket endpoint denied: %s",allowed)}
	}
	for _, bad := range []string{"","tcp://127.0.0.1:2375","ssh://remote/run/docker.sock","unix://remote/run/docker.sock","unix:///var/../tmp/docker.sock"}{
		if observerUnixSocketKind(bad){t.Fatalf("remote/unsafe Docker endpoint accepted: %s",bad)}
	}
}
