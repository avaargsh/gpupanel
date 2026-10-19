package service

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func testAppRoots(t *testing.T) []string {
	t.Helper()
	root:=t.TempDir()
	paths:=[]string{filepath.Join(root,"apps"),filepath.Join(root,"apps","local")}
	for _, p:=range paths{
		if err:=os.MkdirAll(p,0755);err!=nil{t.Fatal(err)}
	}
	return paths
}

func TestG5FilesystemPreflightEmptyKnownRootsIsNotFullReleaseProof(t *testing.T) {
	roots:=testAppRoots(t)
	out,err:=inspectAppInstallFilesystemPreflight("jupyter",fixtureHostHash,roots)
	if err!=nil{t.Fatal(err)}
	if !out.KnownRootsClear || out.RootsChecked!=2 || out.CanRelease || out.Verified ||
		!slices.Contains(out.Reasons,"EXTERNAL_BIND_MOUNTS_AND_USER_PATHS_NOT_OBSERVED"){
		t.Fatalf("empty known app roots became full filesystem clearance: %+v",out)
	}
}

func TestG5FilesystemPreflightFindsExistingAppInstanceAcrossBothRoots(t *testing.T) {
	for _, rootIndex:=range []int{0,1}{
		t.Run(string(rune('0'+rootIndex)),func(t *testing.T){
			roots:=testAppRoots(t)
			p:=filepath.Join(roots[rootIndex],"app-key","JUPYTER")
			if err:=os.MkdirAll(p,0755);err!=nil{t.Fatal(err)}
			out,err:=inspectAppInstallFilesystemPreflight("jupyter",fixtureHostHash,roots)
			if err!=nil{t.Fatal(err)}
			if out.KnownRootsClear || out.CanRelease || !slices.Contains(out.Reasons,"APP_INSTANCE_FILESYSTEM_RESIDUE"){
				t.Fatalf("directory residue overlooked: %+v",out)
			}
		})
	}
}

func TestG5FilesystemPreflightRejectsSymlinkedAppKeyAndInstance(t *testing.T) {
	roots:=testAppRoots(t)
	external:=t.TempDir()
	if err:=os.Symlink(external,filepath.Join(roots[0],"linked-app-key"));err!=nil{t.Skipf("no symlinks: %v",err)}
	if err:=os.MkdirAll(filepath.Join(roots[1],"safe-key"),0755);err!=nil{t.Fatal(err)}
	if err:=os.Symlink(external,filepath.Join(roots[1],"safe-key","strange-instance"));err!=nil{t.Fatal(err)}
	out,err:=inspectAppInstallFilesystemPreflight("jupyter",fixtureHostHash,roots)
	if err!=nil{t.Fatal(err)}
	if out.KnownRootsClear || out.CanRelease ||
		!slices.Contains(out.Reasons,"APP_INSTALL_PATH_OWNERSHIP_UNKNOWN"){
		t.Fatalf("untrusted path traversal marked safe: %+v",out)
	}
}

func TestG5FilesystemPreflightRejectsSymlinkedRootAndMissingRoot(t *testing.T) {
	roots:=testAppRoots(t)
	real:=roots[1]
	link:=filepath.Join(t.TempDir(),"alias")
	if err:=os.Symlink(real,link);err!=nil{t.Skipf("no symlinks: %v",err)}
	for _, p:=range []string{link,filepath.Join(t.TempDir(),"not-created"),"/"} {
		out,err:=inspectAppInstallFilesystemPreflight("jupyter",fixtureHostHash,[]string{roots[0],p})
		if err!=nil{t.Fatal(err)}
		if out.KnownRootsClear || !slices.Contains(out.Reasons,"APP_INSTALL_PATH_OWNERSHIP_UNKNOWN"){
			t.Fatalf("root %q claimed complete: %+v",p,out)
		}
	}
}

func TestG5FilesystemPreflightScanSaturationBlocksConclusion(t *testing.T) {
	roots:=testAppRoots(t)
	for i:=0;i<maxAppFilesystemEntries+1;i++{
		p:=filepath.Join(roots[0],"appkey-"+strings.Repeat("0",3)+string(rune(0x100+i)))
		if err:=os.MkdirAll(p,0755);err!=nil{t.Fatal(err)}
	}
	out,err:=inspectAppInstallFilesystemPreflight("jupyter",fixtureHostHash,roots)
	if err!=nil{t.Fatal(err)}
	if out.KnownRootsClear || !slices.Contains(out.Reasons,"APP_INSTALL_PATH_OWNERSHIP_UNKNOWN"){
		t.Fatalf("saturated directory was trusted: %+v",out)
	}
}

func TestG5FilesystemPreflightMissingHostOrRootsNeverClear(t *testing.T) {
	roots:=testAppRoots(t)
	for _, tc:=range []struct{host string; roots []string}{
		{"",roots},
		{fixtureHostHash,nil},
		{fixtureHostHash,[]string{roots[0]}},
		{fixtureHostHash,[]string{roots[0],""}},
	}{
		out,err:=inspectAppInstallFilesystemPreflight("jupyter",tc.host,tc.roots)
		if err!=nil{t.Fatal(err)}
		if out.KnownRootsClear || out.CanRelease ||
			!slices.Contains(out.Reasons,"HOST_OR_APP_ROOTS_UNAVAILABLE"){
			t.Fatalf("incomplete source was treated as clear: %+v",out)
		}
	}
}

func TestG5FilesystemPreflightInvalidNameIsRejected(t *testing.T){
	roots:=testAppRoots(t)
	for _, bad:=range []string{""," ",strings.Repeat("x",256)}{
		if _,err:=inspectAppInstallFilesystemPreflight(bad,fixtureHostHash,roots);err==nil{
			t.Fatalf("invalid name accepted: %q",bad)
		}
	}
}
