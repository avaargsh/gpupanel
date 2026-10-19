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

func TestG3BackupInventoryAllowsFreshInstallWithoutOptionalLanguageAndGeoIP(t *testing.T) {
	original, svc := g3BackupFixture(t)
	geo := filepath.Join(filepath.Dir(svc.coreBinary), "geo", "GeoIP.mmdb")
	for _, target := range []string{filepath.Join(original, "lang"), filepath.Join(original, "GeoIP.mmdb"), geo} {
		if err := os.RemoveAll(target); err != nil { t.Fatal(err) }
	}
	if err := verifyUpgradeBackupInventory(original, svc); err != nil {
		t.Fatalf("normal fresh install missing optional language/GeoIP must not block upgrade: %v", err)
	}
}

func TestG3BackupInventoryRequiresMatchingGeoIPWhenInstalled(t *testing.T) {
	for _, kind := range []string{"only-installed", "only-backup", "symlink", "wrong-bytes"} {
		t.Run(kind, func(t *testing.T) {
			original, svc := g3BackupFixture(t)
			installed := filepath.Join(filepath.Dir(svc.coreBinary), "geo", "GeoIP.mmdb")
			saved := filepath.Join(original, "GeoIP.mmdb")
			switch kind {
			case "only-installed":
				if err := os.Remove(saved); err != nil { t.Fatal(err) }
			case "only-backup":
				if err := os.Remove(installed); err != nil { t.Fatal(err) }
			case "symlink":
				if err := os.Remove(saved); err != nil { t.Fatal(err) }
				if err := os.Symlink(installed, saved); err != nil { t.Fatal(err) }
			case "wrong-bytes":
				if err := os.WriteFile(saved, []byte("incorrect GeoIP snapshot"), 0600); err != nil { t.Fatal(err) }
			}
			if err := verifyUpgradeBackupInventory(original, svc); err == nil {
				t.Fatalf("unsafe optional GeoIP state %s admitted", kind)
			}
		})
	}
}

func TestG3UpgradeOptionalAssetsPreserveOriginalAbsence(t *testing.T) {
	root := t.TempDir()
	installed := filepath.Join(root, "installed")
	snapshot := filepath.Join(root, "snapshot")
	incoming := filepath.Join(root, "incoming")
	if err := os.WriteFile(incoming, []byte("new GeoIP"), 0600); err != nil { t.Fatal(err) }
	if yes, err := shouldCopyOptionalUpgradeAsset(installed, snapshot, incoming, false); yes || err != nil {
		t.Fatalf("absent original must not introduce unrollbackable file: yes=%v err=%v",yes,err)
	}
	if err := os.WriteFile(installed, []byte("old GeoIP"), 0600); err != nil { t.Fatal(err) }
	if yes, err := shouldCopyOptionalUpgradeAsset(installed, snapshot, incoming, false); yes || err == nil {
		t.Fatalf("missing rollback copy was accepted: yes=%v err=%v",yes,err)
	}
	if err := os.WriteFile(snapshot, []byte("old GeoIP"), 0600); err != nil { t.Fatal(err) }
	if yes, err := shouldCopyOptionalUpgradeAsset(installed, snapshot, incoming, false); !yes || err != nil {
		t.Fatalf("valid existing asset and rollback copy rejected: yes=%v err=%v",yes,err)
	}
	if err := os.Remove(incoming); err != nil { t.Fatal(err) }
	if yes, err := shouldCopyOptionalUpgradeAsset(installed, snapshot, incoming, false); yes || err != nil {
		t.Fatalf("optional package asset absence rejected: yes=%v err=%v",yes,err)
	}
	if err := os.Symlink(installed, incoming); err != nil { t.Fatal(err) }
	if yes, err := shouldCopyOptionalUpgradeAsset(installed, snapshot, incoming, false); yes || err == nil {
		t.Fatalf("redirected new asset was accepted: yes=%v err=%v",yes,err)
	}
}

func TestG3UpgradeOptionalLanguageDirectoryIsNotMandatory(t *testing.T) {
	root := t.TempDir()
	installed := filepath.Join(root, "lang")
	snapshot := filepath.Join(root, "backup-lang")
	incoming := filepath.Join(root, "incoming-lang")
	if err := os.Mkdir(incoming, 0700); err != nil { t.Fatal(err) }
	if yes, err := shouldCopyOptionalUpgradeAsset(installed, snapshot, incoming, true); yes || err != nil {
		t.Fatalf("fresh install should not require /usr/local/bin/lang: yes=%v err=%v",yes,err)
	}
	for _, dir := range []string{installed,snapshot} {
		if err := os.Mkdir(dir, 0700); err != nil { t.Fatal(err) }
	}
	if yes, err := shouldCopyOptionalUpgradeAsset(installed, snapshot, incoming, true); !yes || err != nil {
		t.Fatalf("existing language with backup not upgraded: yes=%v err=%v",yes,err)
	}
	if err := os.Remove(incoming); err != nil { t.Fatal(err) }
	if err := os.Symlink(installed,incoming); err != nil { t.Fatal(err) }
	if yes, err := shouldCopyOptionalUpgradeAsset(installed,snapshot,incoming,true); yes || err == nil {
		t.Fatalf("symlinked language payload accepted: yes=%v err=%v",yes,err)
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
