package service

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func g3BackupFixture(t *testing.T) (string, serviceInfo) {
	t.Helper()
	base, units, svc := upgradeRuntimeFixture(t)
	root := filepath.Join(base, "gpupanel")
	svc.coreBinary = filepath.Join(root, "gpupanel-core")
	svc.agentBinary = filepath.Join(root, "gpupanel-agent")
	original := filepath.Join(t.TempDir(), "original")
	for _, p := range []string{
		original, filepath.Join(original, "db"), filepath.Join(original, "lang"),
		filepath.Join(root, "db"), filepath.Join(root, "geo"),
	} {
		if err := os.MkdirAll(p, 0700); err != nil { t.Fatal(err) }
	}
	for _, pair := range [][2]string{
		{svc.coreBinary, filepath.Join(original, "gpupanel-core")},
		{svc.agentBinary, filepath.Join(original, "gpupanel-agent")},
		{filepath.Join(units, svc.coreName), filepath.Join(original, svc.coreName)},
		{filepath.Join(units, svc.agentName), filepath.Join(original, svc.agentName)},
	} {
		b, err := os.ReadFile(pair[0])
		if err != nil { t.Fatal(err) }
		if err := os.WriteFile(pair[1], b, 0700); err != nil { t.Fatal(err) }
	}
	for _, pair := range [][2]string{
		{filepath.Join(root, "geo", "GeoIP.mmdb"), filepath.Join(original, "GeoIP.mmdb")},
		{filepath.Join(root, "db", "gpupanel.db"), filepath.Join(original, "db", "gpupanel.db")},
		{filepath.Join(root, "db", "agent.db"), filepath.Join(original, "db", "agent.db")},
	} {
		if err := os.WriteFile(pair[0], []byte("fixture nonempty bytes"), 0600); err != nil { t.Fatal(err) }
		if err := os.WriteFile(pair[1], []byte("fixture nonempty bytes"), 0600); err != nil { t.Fatal(err) }
	}
	return original, svc
}

func TestG3BackupInventoryAcceptsOwnedCompleteSnapshot(t *testing.T) {
	original, svc := g3BackupFixture(t)
	if err := verifyUpgradeBackupInventory(original, svc); err != nil {
		t.Fatalf("owned complete snapshot refused: %v", err)
	}
}

func TestG3BackupInventoryBlocksTruncatedExecutableAndUnit(t *testing.T) {
	for _, file := range []string{"gpupanel-core", "gpupanel-agent", "gpupanel-core.service",
		"gpupanel-agent.service", "GeoIP.mmdb"} {
		t.Run(file, func(t *testing.T) {
			original, svc := g3BackupFixture(t)
			if err := os.WriteFile(filepath.Join(original, file), []byte("truncated"), 0600); err != nil {
				t.Fatal(err)
			}
			if err := verifyUpgradeBackupInventory(original, svc); err == nil {
				t.Fatalf("corrupted rollback %s unexpectedly authorized upgrade", file)
			}
		})
	}
}

func TestG3BackupInventoryDeniesSymlinksAndMissingDirectories(t *testing.T) {
	for _, name := range []string{"root", "db", "lang", "agent"} {
		t.Run(name, func(t *testing.T) {
			original, svc := g3BackupFixture(t)
			to := original
			if name == "db" || name == "lang" { to = filepath.Join(original, name) }
			if name == "agent" { to = filepath.Join(original, "gpupanel-agent") }
			if err := os.RemoveAll(to); err != nil { t.Fatal(err) }
			if err := os.Symlink(t.TempDir(), to); err != nil { t.Fatal(err) }
			if err := verifyUpgradeBackupInventory(original, svc); err == nil {
				t.Fatalf("redirected backup %s unexpectedly authorized upgrade", name)
			}
		})
	}
}

func TestG3BackupInventoryDeniesMissingEmptyOrRedirectedDB(t *testing.T) {
	for _, kind := range []string{"missing", "empty", "redirected", "new-untracked"} {
		t.Run(kind, func(t *testing.T) {
			original, svc := g3BackupFixture(t)
			target := filepath.Join(original, "db", "agent.db")
			switch kind {
			case "missing":
				if err := os.Remove(target); err != nil { t.Fatal(err) }
			case "empty":
				if err := os.WriteFile(target, nil, 0600); err != nil { t.Fatal(err) }
			case "redirected":
				if err := os.Remove(target); err != nil { t.Fatal(err) }
				if err := os.Symlink(filepath.Join(t.TempDir(), "unknown"), target); err != nil { t.Fatal(err) }
			case "new-untracked":
				if err := os.WriteFile(filepath.Join(original, "db", "foreign.db"), []byte("surprise"), 0600); err != nil {
					t.Fatal(err)
				}
			}
			if err := verifyUpgradeBackupInventory(original, svc); err == nil {
				t.Fatalf("database inventory %s unexpectedly authorized upgrade", kind)
			}
		})
	}
}

func TestG3UpgradeGuardsDurableBackupAndRollbackLogBeforeWrites(t *testing.T) {
	src, err := os.ReadFile("upgrade.go")
	if err != nil { t.Fatal(err) }
	s := string(src)
	precheck := strings.Index(s, "verifyUpgradeBackupInventory(originalDir, svcInfo)")
	record := strings.Index(s, "upgradeLogRepo.Create(&itemLog)")
	mutate := strings.Index(s, "files.CopyFileWithRename(path.Join(tmpDir, \"gpupanel-core\"), svcInfo.coreBinary)")
	if precheck < 0 || record < 0 || mutate < 0 || precheck >= record || record >= mutate {
		t.Fatal("upgrade can replace installed binary before backup and rollback log are verified")
	}
	if !strings.Contains(s, "if err := upgradeLogRepo.Create(&itemLog); err != nil") {
		t.Fatal("upgrade ignored failure to persist rollback record")
	}
}
