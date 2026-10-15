package accelerator

import (
	"context"
	"errors"
	"strings"
	"testing"
)

type fixtureProvider struct {
	kind Kind
	snapshot *ProviderSnapshot
	err error
}
func (p fixtureProvider) Kind() Kind { return p.kind }
func (p fixtureProvider) Collect(context.Context) (*ProviderSnapshot, error) {
	return p.snapshot, p.err
}

func TestInjectedProvidersReturnValidSnapshot(t *testing.T) {
	ok := fixtureProvider{kind: KindGPU, snapshot: &ProviderSnapshot{
		Type: "nvidia", DriverVersion: "fixture-driver", Devices: []Device{
			{ID: "nvidia:fixture-001", Kind: KindGPU, Vendor: "nvidia", Name: "Fake accelerator"},
		},
	}}
	snapshot, err := NewWithProviders(ok).Collect(context.Background())
	if err != nil { t.Fatalf("Collect failed: %v", err) }
	if len(snapshot.Devices) != 1 || snapshot.Devices[0].ID != "nvidia:fixture-001" {
		t.Fatalf("unexpected devices: %+v", snapshot.Devices)
	}
	if snapshot.Info.Type != "nvidia" || snapshot.Info.CollectedAt.IsZero() {
		t.Fatalf("missing metadata: %+v", snapshot.Info)
	}
}

func TestPartialFailureIsWarningNotFalseSuccess(t *testing.T) {
	working := fixtureProvider{kind: KindGPU, snapshot: &ProviderSnapshot{
		Type: "nvidia", Devices: []Device{{ID: "nvidia:test", Kind: KindGPU}},
	}}
	failed := fixtureProvider{kind: KindNPU, err: errors.New("provider offline")}
	snapshot, err := NewWithProviders(working, failed).Collect(context.Background())
	if err != nil { t.Fatalf("partial success should not fail: %v", err) }
	if len(snapshot.Devices) != 1 || snapshot.Warning() == nil {
		t.Fatalf("missing partial device or warning: %+v", snapshot)
	}
	if !strings.Contains(snapshot.Warning().Error(), "provider offline") {
		t.Fatalf("provider failure must be preserved: %v", snapshot.Warning())
	}
}

func TestAllProvidersFailedReturnsError(t *testing.T) {
	broken := fixtureProvider{kind: KindGPU, err: errors.New("missing driver")}
	if _, err := NewWithProviders(broken).Collect(context.Background()); err == nil {
		t.Fatal("no usable devices with provider error must not return success")
	}
}

func TestCancelledContextRemainsCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := NewWithProviders().Collect(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("expected cancelled context, got %v", err)
	}
}

func TestAdapterListIsDefensivelyCopied(t *testing.T) {
	original := []Provider{fixtureProvider{kind: KindGPU, snapshot: &ProviderSnapshot{
		Type: "nvidia", Devices: []Device{{ID: "old", Kind: KindGPU}},
	}}}
	client := NewWithProviders(original...)
	original[0] = fixtureProvider{kind: KindGPU, err: errors.New("changed")}
	snapshot, err := client.Collect(context.Background())
	if err != nil || len(snapshot.Devices) != 1 || snapshot.Devices[0].ID != "old" {
		t.Fatalf("adapter list was mutated by caller: %+v, %v", snapshot, err)
	}
}
