package service

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func upgradeRuntimeFixture(t *testing.T) (string, string, serviceInfo) {
	t.Helper()
	parent := t.TempDir()
	base := filepath.Join(parent, "opt")
	units := filepath.Join(parent, "units")
	root := filepath.Join(base, "gpupanel")
	if err := os.MkdirAll(root, 0700); err != nil { t.Fatal(err) }
	if err := os.MkdirAll(units, 0700); err != nil { t.Fatal(err) }
	for _, name := range []string{"core", "agent"} {
		bin := filepath.Join(root, "gpupanel-"+name)
		if err := os.WriteFile(bin, []byte("#!/bin/sh\nexit 0\n"), 0700); err != nil { t.Fatal(err) }
		unit := "[Service]\nType=simple\nWorkingDirectory="+root+"\nExecStart="+bin+"\n"
		if err := os.WriteFile(filepath.Join(units, "gpupanel-"+name+".service"), []byte(unit), 0600); err != nil { t.Fatal(err) }
	}
	svc := serviceInfo{basePath: units, coreName: "gpupanel-core.service", agentName: "gpupanel-agent.service"}
	return base, units, svc
}

func TestG3UpgradeSelectsOwnedRealBinariesNotCompatibilityLinks(t *testing.T) {
	base, units, svc := upgradeRuntimeFixture(t)
	root := filepath.Join(base,"gpupanel")
	alias := filepath.Join(t.TempDir(),"gpupanel-core")
	if err := os.Symlink(filepath.Join(root,"gpupanel-core"),alias);err!=nil{t.Fatal(err)}
	core, agent, err := validateOwnedUpgradePaths(base, svc, base, units)
	if err != nil { t.Fatal(err) }
	if core != filepath.Join(root,"gpupanel-core") || agent != filepath.Join(root,"gpupanel-agent") || core == alias {
		t.Fatalf("upgrade must never replace compatibility link: core=%s agent=%s",core,agent)
	}
}

func TestG3UpgradeDeniesSymlinkedExecutableAndDirectory(t *testing.T) {
	for _, candidate := range []string{"binary","directory"} {
		t.Run(candidate,func(t *testing.T){
			base, units, svc := upgradeRuntimeFixture(t)
			target:=filepath.Join(base,"gpupanel","gpupanel-core")
			if candidate=="binary"{
				if err:=os.Remove(target);err!=nil{t.Fatal(err)}
				foreign:=filepath.Join(t.TempDir(),"foreign-core")
				if err:=os.WriteFile(foreign,[]byte("foreign"),0700);err!=nil{t.Fatal(err)}
				if err:=os.Symlink(foreign,target);err!=nil{t.Fatal(err)}
			}else{
				root:=filepath.Join(base,"gpupanel")
				foreign:=filepath.Join(t.TempDir(),"foreign-gpupanel")
				if err:=os.Rename(root,foreign);err!=nil{t.Fatal(err)}
				if err:=os.Symlink(foreign,root);err!=nil{t.Fatal(err)}
			}
			if _,_,err:=validateOwnedUpgradePaths(base,svc,base,units);!errors.Is(err,errUpgradeRuntimeOwnership){
				t.Fatalf("redirected runtime admitted: %v",err)
			}
		})
	}
}

func TestG3UpgradeDeniesMissingExecutableAndWrongUnitIdentity(t *testing.T) {
	for _, candidate := range []string{"missing","nonexecutable","wrong-target","duplicate-target","wrong-working-dir","unit-symlink","unit-missing"} {
		t.Run(candidate,func(t *testing.T){
			base, units, svc := upgradeRuntimeFixture(t)
			bin:=filepath.Join(base,"gpupanel","gpupanel-agent")
			unit:=filepath.Join(units,"gpupanel-agent.service")
			content,err:=os.ReadFile(unit)
			if err!=nil{t.Fatal(err)}
			switch candidate {
			case "missing": err=os.Remove(bin)
			case "nonexecutable": err=os.Chmod(bin,0600)
			case "wrong-target": err=os.WriteFile(unit,[]byte(strings.ReplaceAll(string(content),"ExecStart="+bin,"ExecStart=/usr/local/bin/gpupanel-agent")),0600)
			case "duplicate-target": err=os.WriteFile(unit,append(content,[]byte("ExecStart="+bin+"\n")...),0600)
			case "wrong-working-dir": err=os.WriteFile(unit,[]byte(strings.ReplaceAll(string(content),"WorkingDirectory="+filepath.Join(base,"gpupanel"),"WorkingDirectory=/tmp")),0600)
			case "unit-symlink":
				err=os.Remove(unit)
				if err==nil{err=os.Symlink(filepath.Join(t.TempDir(),"outside-unit"),unit)}
			case "unit-missing": err=os.Remove(unit)
			}
			if err!=nil{t.Fatal(err)}
			if _,_,err:=validateOwnedUpgradePaths(base,svc,base,units);!errors.Is(err,errUpgradeRuntimeOwnership){
				t.Fatalf("invalid %s accepted: %v",candidate,err)
			}
		})
	}
}

func TestG3UpgradeRejectsUnexpectedServiceManagerAndBase(t *testing.T) {
	base, units, svc := upgradeRuntimeFixture(t)
	for _, bad := range []struct{base string;unitDir string;svc serviceInfo}{
		{base,units,serviceInfo{basePath:"/etc/init.d",coreName:svc.coreName,agentName:svc.agentName}},
		{base+"/..",units,svc},
		{filepath.Join(base,"other"),units,svc},
		{base,units,serviceInfo{basePath:units,coreName:"gpupanel-core",agentName:svc.agentName}},
	} {
		if _,_,err:=validateOwnedUpgradePaths(bad.base,bad.svc,bad.base,bad.unitDir);!errors.Is(err,errUpgradeRuntimeOwnership){
			t.Fatalf("unreviewed runtime identity accepted: %#v %v",bad,err)
		}
	}
}

func TestG3ManualRollbackRefusesOnlineDBAndExecutableMutation(t *testing.T) {
	src, err := os.ReadFile("upgrade.go")
	if err != nil { t.Fatal(err) }
	marker := "func (u *UpgradeService) Rollback("
	start := strings.Index(string(src), marker)
	end := strings.Index(string(src), "type noteHelper struct")
	if start < 0 || end < start { t.Fatal("manual rollback API entrypoint missing") }
	handler := string(src)[start:end]
	for _, required := range []string{
		`validateUpgradeBackupPath(global.CONF.Base.InstallDir, log.BackupFile)`,
		`verifyUpgradeBackupInventory(backup, svcInfo)`,
		`online rollback is disabled until offline service-stop`,
	} {
		if !strings.Contains(handler, required) {
			t.Errorf("online rollback must refuse unsafe mutation: missing %q", required)
		}
	}
	if strings.Contains(handler, "return u.handleRollback(") {
		t.Fatal("running Core API must not restore SQLite files or overwrite its own executable")
	}
	for _, required := range []string{
		`return errors.Join(failures...)`,
		`record("core executable",`,
		`record("agent executable",`,
	} {
		if !strings.Contains(string(src), required) {
			t.Errorf("staged executable rollback must report failure; missing %q", required)
		}
	}
	if strings.Contains(string(src), `record("database restore",`) ||
		strings.Contains(string(src), `files.CopyItem(true, true, dbBackup, dbPath)`) {
		t.Fatal("neither manual nor automatic rollback may overwrite databases while Core is running")
	}
}

func TestG3UpgradeNeverWritesCompatibilityPath(t *testing.T){
	src,err:=os.ReadFile("upgrade.go")
	if err!=nil{t.Fatal(err)}
	for _, legacy:=range []string{`"/usr/local/bin/gpupanel-core"`,`"/usr/local/bin/gpupanel-agent"`} {
		if strings.Contains(string(src),legacy){
			t.Fatalf("upgrade still performs writes or backups through compatibility symlink %s",legacy)
		}
	}
	for _, requirement:=range []string{"svcInfo.coreBinary","svcInfo.agentBinary","upgradeRuntimePaths("}{
		if !strings.Contains(string(src),requirement){t.Fatalf("missing required owned-executable wiring %s",requirement)}
	}
}

func TestG3UpgradeVersionRejectsTraversalAndUnboundedTokens(t *testing.T) {
	invalid := []string{"", "../..", "/tmp", "v2.0.0/../../", "v2.0.0\\\\x",
		"v2.0.0%2f..", "v2.0.0-..", "v2.0.0-", "v2.0.0\\n", "v2.0.0;rm",
		"v2.0", "v2.0.0é", strings.Repeat("a", 140)}
	for _, version := range invalid {
		if err := validateUpgradeVersion(version); err == nil {
			t.Errorf("unsafe upgrade version accepted: %q", version)
		}
	}
	for _, version := range []string{"v2.0.0", "v2.0.0-lts", "v2.0.0-beta.2",
		"v2.1.0-dev-1", "2.0.0"} {
		if err := validateUpgradeVersion(version); err != nil {
			t.Errorf("valid release version %q rejected: %v", version, err)
		}
	}
}

func TestG3UpgradeStagingPreservesExistingRollbackEvidence(t *testing.T) {
	base, _, _ := upgradeRuntimeFixture(t)
	dir, err := createUpgradeStage(base, "v2.0.0-lts")
	if err != nil { t.Fatal(err) }
	snapshot := filepath.Join(dir,"original","existing.db")
	if err := os.WriteFile(snapshot, []byte("evidence-do-not-delete"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := createUpgradeStage(base, "v2.0.0-lts"); err == nil {
		t.Fatal("repeated version overwrote previous rollback evidence")
	}
	preserved, err := os.ReadFile(snapshot)
	if err != nil || string(preserved) != "evidence-do-not-delete" {
		t.Fatalf("existing rollback evidence removed: %q %v", preserved, err)
	}
	for _, v := range []string{"../../etc", "/tmp", "."} {
		if _, err := createUpgradeStage(base, v); err == nil {
			t.Fatalf("unsafe version %q created stage", v)
		}
	}
}


func TestG3UpgradeStagingCleansEmptyPartialTransactionOnChildFailure(t *testing.T) {
	base, _, _ := upgradeRuntimeFixture(t)
	upgradeRoot := filepath.Join(base, "gpupanel", "tmp", "upgrade")
	if err := os.MkdirAll(upgradeRoot, 0700); err != nil {
		t.Fatal(err)
	}
	transaction := filepath.Join(upgradeRoot, "v2.0.0")
	if err := os.Mkdir(transaction, 0700); err != nil {
		t.Fatal(err)
	}
	injected := errors.New("injected original-directory failure")
	mkdir := func(path string, mode os.FileMode) error {
		if filepath.Base(path) == "original" {
			return injected
		}
		return os.Mkdir(path, mode)
	}
	if err := createUpgradeStageChildren(transaction, mkdir, os.Remove); !errors.Is(err, injected) {
		t.Fatalf("expected injected child creation failure, got %v", err)
	}
	if _, err := os.Lstat(transaction); !os.IsNotExist(err) {
		t.Fatalf("empty partial transaction was not cleaned: err=%v", err)
	}
	// A safe cleanup makes an ordinary retry possible for the same version.
	if _, err := createUpgradeStage(base, "v2.0.0"); err != nil {
		t.Fatalf("retry after empty partial setup failed: %v", err)
	}
}

func TestG3UpgradeStagingPreservesNonEmptyPartialDirectoriesOnFailure(t *testing.T) {
	base, _, _ := upgradeRuntimeFixture(t)
	upgradeRoot := filepath.Join(base, "gpupanel", "tmp", "upgrade")
	if err := os.MkdirAll(upgradeRoot, 0700); err != nil {
		t.Fatal(err)
	}
	transaction := filepath.Join(upgradeRoot, "v2.0.0")
	if err := os.Mkdir(transaction, 0700); err != nil {
		t.Fatal(err)
	}
	injected := errors.New("injected original-directory failure")
	mkdir := func(path string, mode os.FileMode) error {
		if filepath.Base(path) == "original" {
			// Model a concurrent writer placing data after downloads was created.
			if err := os.WriteFile(filepath.Join(transaction, "downloads", "keep.bin"), []byte("preserve"), 0600); err != nil {
				return err
			}
			return injected
		}
		return os.Mkdir(path, mode)
	}
	if err := createUpgradeStageChildren(transaction, mkdir, os.Remove); !errors.Is(err, injected) {
		t.Fatalf("expected injected child creation failure, got %v", err)
	}
	preserved, err := os.ReadFile(filepath.Join(transaction, "downloads", "keep.bin"))
	if err != nil || string(preserved) != "preserve" {
		t.Fatalf("partial-stage evidence was removed: data=%q err=%v", preserved, err)
	}
}

func TestG3UpgradeStagingRejectsRedirectedParents(t *testing.T) {
	base, _, _ := upgradeRuntimeFixture(t)
	foreign := t.TempDir()
	link := filepath.Join(base, "gpupanel", "tmp")
	if err := os.Symlink(foreign,link); err != nil { t.Fatal(err) }
	if _, err := createUpgradeStage(base, "v2.0.0"); !errors.Is(err,errUpgradeRuntimeOwnership) {
		t.Fatalf("staging through redirected tmp permitted: %v",err)
	}
	entries, err := os.ReadDir(foreign)
	if err != nil || len(entries) != 0 {
		t.Fatalf("redirected destination was modified: %v %+v",err,entries)
	}
}

func TestG3RollbackBackupPathRequiresExactOwnedVersionAndPlainDirs(t *testing.T) {
	base, _, _ := upgradeRuntimeFixture(t)
	path, err := createUpgradeStage(base, "v2.0.0")
	if err != nil { t.Fatal(err) }
	original, err := validateUpgradeBackupPath(base, path)
	if err != nil || original != filepath.Join(path, "original") {
		t.Fatalf("freshly owned backup was denied: %s %v", original, err)
	}
	for _, invalid := range []string{base, filepath.Join(base,"gpupanel","tmp","upgrade"),
		filepath.Join(path, "original"), filepath.Join(path, "..", "unexpected"),
		path + "/../v2.0.0"} {
		if _, err := validateUpgradeBackupPath(base, invalid); err == nil {
			t.Errorf("ambiguous stored rollback directory allowed: %s", invalid)
		}
	}
	if err := os.RemoveAll(filepath.Join(path, "original")); err != nil { t.Fatal(err) }
	if err := os.Symlink(t.TempDir(),filepath.Join(path,"original")); err != nil { t.Fatal(err) }
	if _, err := validateUpgradeBackupPath(base, path); !errors.Is(err, errUpgradeRuntimeOwnership) {
		t.Fatalf("redirected original backup allowed: %v",err)
	}
}

func TestG3UpgradeNeverUsesRecursiveStageDeletion(t *testing.T) {
	src, err := os.ReadFile("upgrade.go")
	if err != nil { t.Fatal(err) }
	for _, unsafe := range []string{"os.RemoveAll(baseDir)", "fmt.Sprintf(\"gpupanel/tmp/upgrade/%s\""} {
		if strings.Contains(string(src),unsafe) { t.Fatalf("unsafe version stage construct: %s", unsafe) }
	}
	for _, required := range []string{"createUpgradeStage(","validateUpgradeVersion(req.Version)",
		"validateUpgradeBackupPath("} {
		if !strings.Contains(string(src),required) { t.Fatalf("required stage guard missing: %s",required) }
	}
}
