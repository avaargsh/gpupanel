package service

import (
	"archive/tar"
	"compress/gzip"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const g3Package = "gpupanel-v1.2.3-linux-amd64"

type g3ArchiveEntry struct {
	name string
	kind byte
	mode int64
	body string
}

func g3ValidArchive() []g3ArchiveEntry {
	return []g3ArchiveEntry{
		{name:g3Package+"/",kind:tar.TypeDir,mode:0755},
		{name:g3Package+"/initscript/",kind:tar.TypeDir,mode:0755},
		{name:g3Package+"/gpupanel-core",kind:tar.TypeReg,mode:0755,body:"core executable"},
		{name:g3Package+"/gpupanel-agent",kind:tar.TypeReg,mode:0755,body:"agent executable"},
		{name:g3Package+"/pctl",kind:tar.TypeReg,mode:0700,body:"# bash script"},
		{name:g3Package+"/initscript/gpupanel-core.service",kind:tar.TypeReg,mode:0644,body:"[Service]"},
		{name:g3Package+"/initscript/gpupanel-agent.service",kind:tar.TypeReg,mode:0644,body:"[Service]"},
		{name:g3Package+"/lang/",kind:tar.TypeDir,mode:0755},
	}
}

func writeG3Archive(t *testing.T, entries []g3ArchiveEntry) string {
	t.Helper()
	p := filepath.Join(t.TempDir(),"candidate.tar.gz")
	f,err:=os.Create(p)
	if err!=nil{t.Fatal(err)}
	zw:=gzip.NewWriter(f)
	tw:=tar.NewWriter(zw)
	for _,entry:=range entries {
		hdr:=&tar.Header{Name:entry.name,Typeflag:entry.kind,Mode:entry.mode,Size:int64(len(entry.body))}
		if entry.kind==tar.TypeSymlink {hdr.Linkname="/etc/passwd";hdr.Size=0}
		if err:=tw.WriteHeader(hdr);err!=nil{t.Fatal(err)}
		if len(entry.body)>0{
			if _,err:=tw.Write([]byte(entry.body));err!=nil{t.Fatal(err)}
		}
	}
	if err:=tw.Close();err!=nil{t.Fatal(err)}
	if err:=zw.Close();err!=nil{t.Fatal(err)}
	if err:=f.Close();err!=nil{t.Fatal(err)}
	return p
}

func TestG3ReleaseArchiveAcceptsReviewedBuildLayout(t *testing.T) {
	file:=writeG3Archive(t,g3ValidArchive())
	if err:=validateUpgradeArchive(file,g3Package);err!=nil{t.Fatalf("expected supported release layout: %v",err)}
}

func TestG3ReleaseArchiveRejectsDangerousEntryTypesAndPaths(t *testing.T) {
	cases:=[]struct{name string; bad g3ArchiveEntry}{
		{"absolute",g3ArchiveEntry{name:"/etc/systemd/system/replaced.service",kind:tar.TypeReg,mode:0644,body:"bad"}},
		{"traversal",g3ArchiveEntry{name:g3Package+"/../owned.txt",kind:tar.TypeReg,mode:0644,body:"bad"}},
		{"dot-component",g3ArchiveEntry{name:g3Package+"/./extra.txt",kind:tar.TypeReg,mode:0644,body:"bad"}},
		{"foreign-root",g3ArchiveEntry{name:"another-root/secret.txt",kind:tar.TypeReg,mode:0644,body:"bad"}},
		{"symlink",g3ArchiveEntry{name:g3Package+"/symlink",kind:tar.TypeSymlink,mode:0777}},
		{"hardlink",g3ArchiveEntry{name:g3Package+"/hardlink",kind:tar.TypeLink,mode:0644}},
		{"world-writable",g3ArchiveEntry{name:g3Package+"/world.txt",kind:tar.TypeReg,mode:0666,body:"bad"}},
		{"setuid",g3ArchiveEntry{name:g3Package+"/rootkit",kind:tar.TypeReg,mode:04755,body:"bad"}},
	}
	for _,tc:=range cases{
		t.Run(tc.name,func(t *testing.T){
			file:=writeG3Archive(t,append(g3ValidArchive(),tc.bad))
			if err:=validateUpgradeArchive(file,g3Package);!errors.Is(err,errUpgradeArchiveRejected){
				t.Fatalf("untrusted archive accepted: %v",err)
			}
		})
	}
}

func TestG3ReleaseArchiveRejectsDuplicatesMissingAndEmptyRequiredFiles(t *testing.T) {
	valid:=g3ValidArchive()
	cases:=[]struct{name string; entries []g3ArchiveEntry}{
		{"duplicate",append(append([]g3ArchiveEntry{},valid...),valid[2])},
		{"missing-agent",append(append([]g3ArchiveEntry{},valid[:3]...),valid[4:]...)},
		{"empty-core",func()[]g3ArchiveEntry{x:=append([]g3ArchiveEntry{},valid...);x[2].body="";return x}()},
		{"nonexec-pctl",func()[]g3ArchiveEntry{x:=append([]g3ArchiveEntry{},valid...);x[4].mode=0644;return x}()},
	}
	for _,tc:=range cases{
		t.Run(tc.name,func(t *testing.T){
			file:=writeG3Archive(t,tc.entries)
			if err:=validateUpgradeArchive(file,g3Package);!errors.Is(err,errUpgradeArchiveRejected){
				t.Fatalf("incomplete/duplicate archive accepted: %v",err)
			}
		})
	}
}

func TestG3ReleaseArchiveRejectsCorruptOrRedirectedFile(t *testing.T) {
	good:=writeG3Archive(t,g3ValidArchive())
	blob,err:=os.ReadFile(good);if err!=nil{t.Fatal(err)}
	if err:=os.WriteFile(good,blob[:len(blob)/2],0600);err!=nil{t.Fatal(err)}
	if err:=validateUpgradeArchive(good,g3Package);!errors.Is(err,errUpgradeArchiveRejected){
		t.Fatalf("truncated gzip accepted: %v",err)
	}
	target:=writeG3Archive(t,g3ValidArchive())
	link:=filepath.Join(t.TempDir(),"redirected.tar.gz")
	if err:=os.Symlink(target,link);err!=nil{t.Fatal(err)}
	if err:=validateUpgradeArchive(link,g3Package);!errors.Is(err,errUpgradeArchiveRejected) {
		t.Fatalf("symlinked archive accepted: %v",err)
	}
	for _,root:=range []string{"","../etc","gpupanel/foreign","C:evil",strings.Repeat("x", 100)+"/more"}{
		if err:=validateUpgradeArchive(target,root);!errors.Is(err,errUpgradeArchiveRejected) {
			t.Fatalf("invalid package root %q accepted: %v",root,err)
		}
	}
}

func TestG3UpgradePreflightsArchiveBeforePrivilegedUntarAndBackup(t *testing.T) {
	src,err:=os.ReadFile("upgrade.go")
	if err!=nil{t.Fatal(err)}
	code:=string(src)
	validate:=strings.Index(code,"validateUpgradeArchive(path.Join(downloadDir, fileName), archiveRoot)")
	extract:=strings.Index(code,"files.HandleUnTar(downloadDir+\"/\"+fileName, downloadDir, \"\")")
	backup:=strings.Index(code,"u.handleBackup(originalDir, svcInfo)")
	if validate<0 || extract<0 || backup<0 || validate>=extract || extract>=backup {
		t.Fatal("upgrade archive scan must precede extraction and backup")
	}
}
