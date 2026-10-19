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
