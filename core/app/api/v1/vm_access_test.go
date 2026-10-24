package v1

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/avaargsh/GPUPanel/core/app/principalproof"
	"github.com/gin-gonic/gin"
)

func TestVMAccessCannotPromotePeerProofToExecution(t *testing.T) {
	cases:=[]struct{name string;proof principalproof.Proof;valid bool;identity string}{
		{"unbound",principalproof.Proof{},false,"Unbound"},
		{"observed",principalproof.Proof{UID:1001,IdentityObserved:true},true,"PeerObserved"},
		{"forged-grant",principalproof.Proof{UID:1001,IdentityObserved:true,ExecutionAuthorized:true},true,"PeerObserved"},
		{"revoked",principalproof.Proof{UID:1001,IdentityObserved:true},false,"Unbound"},
	}
	for _,tc:=range cases {
		t.Run(tc.name,func(t *testing.T){
			v:=vmAccessProof(tc.proof,tc.valid)
			if v.Connection!="qemu:///system" || v.Identity!=tc.identity ||
				v.LibvirtAuthorization!="NotAssessed" ||
				v.InventoryAuthorized || v.ExecutionAuthorized {
				t.Fatalf("privilege escalation: %#v",v)
			}
			if (v.LinuxUID!=nil)!=(tc.identity=="PeerObserved"){
				t.Fatalf("UID disclosed without verified proof: %#v",v)
			}
		})
	}
}

func TestVMAccessHTTPFailClosedWhenUnavailableOrUntrusted(t *testing.T) {
	_,cookies,_,_:=projectRegistryHarness(t)
	gin.SetMode(gin.TestMode)
	r:=gin.New()
	r.GET("/api/v1/core/vms/access",(&BaseApi{}).VMAccessStatus)
	check:=func(remote string,session bool,header string) int {
		req:=httptest.NewRequest(http.MethodGet,"/api/v1/core/vms/access",nil)
		req.RemoteAddr=remote
		if session {for _,c:=range cookies{req.AddCookie(c)}}
		if header!=""{req.Header.Set(header,"spoofed")}
		resp:=httptest.NewRecorder()
		r.ServeHTTP(resp,req)
		return resp.Code
	}
	for name,tc:=range map[string]struct{remote string;session bool;header string}{
		"anonymous":{"127.0.0.1:1234",false,""},
		"remote":{"198.51.100.10:1234",true,""},
		"proxy-spoof":{"127.0.0.1:1234",true,"X-Forwarded-For"},
		"api-key-spoof":{"127.0.0.1:1234",true,"1Panel-Token"},
	}{
		t.Run(name,func(t *testing.T){
			if got:=check(tc.remote,tc.session,tc.header);got!=http.StatusForbidden{t.Fatalf("status=%d",got)}
		})
	}
	if got:=check("127.0.0.1:1234",true,"");got!=http.StatusServiceUnavailable {
		t.Fatalf("disabled proof listener must fail closed, got %d",got)
	}
}
