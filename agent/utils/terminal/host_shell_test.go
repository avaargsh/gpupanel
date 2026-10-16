package terminal

import (
	"os"
	"path/filepath"
	"testing"
)

func TestHostShellCapacityAndRelease(t *testing.T) {
	marker := filepath.Join(t.TempDir(), "should-not-exist")
	for range cap(hostShellSlots) {
		hostShellSlots <- struct{}{}
	}
	if _, err := NewHostShell("touch '" + marker + "'"); err == nil {
		t.Fatal("opened shell beyond capacity")
	}
	for range cap(hostShellSlots) {
		<-hostShellSlots
	}
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Fatal("capacity failure executed a command")
	}
	command, err := NewHostShell("sleep 1")
	if err != nil {
		t.Fatal(err)
	}
	if len(hostShellSlots) != 1 {
		t.Fatal("shell slot not owned")
	}
	if err := command.Close(); err != nil {
		t.Fatal(err)
	}
	_ = command.WaitResult()
	_ = command.Close()
	if len(hostShellSlots) != 0 {
		t.Fatal("shell slot leaked after close")
	}
}
