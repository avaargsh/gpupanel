package v1

import (
	"github.com/avaargsh/GPUPanel/core/app/api/v1/helper"
	"github.com/avaargsh/GPUPanel/core/app/principalproof"
	"github.com/gin-gonic/gin"
)

// This is identity readiness only, NEVER an execution grant.
type vmAccessView struct {
	Connection string `json:"connection"`
	Identity string `json:"identity"`
	LinuxUID *uint32 `json:"linuxUid,omitempty"`
	LibvirtAuthorization string `json:"libvirtAuthorization"`
	InventoryAuthorized bool `json:"inventoryAuthorized"`
	ExecutionAuthorized bool `json:"executionAuthorized"`
}

func vmAccessProof(proof principalproof.Proof, valid bool) vmAccessView {
	view:=vmAccessView{
		Connection:"qemu:///system",
		Identity:"Unbound",
		LibvirtAuthorization:"NotAssessed",
	}
	if valid && proof.IdentityObserved {
		uid:=proof.UID
		view.LinuxUID=&uid
		view.Identity="PeerObserved"
	}
	// A proof of the Linux UID does not authorize acting on a VM.
	return view
}

// Read-only browser contract: the existing gate verifies local admin session,
// active cookie digest and optional SO_PEERCRED proof. No virsh or Host runner.
func (b *BaseApi) VMAccessStatus(c *gin.Context) {
	rt,digest,ok:=principalWebSession(c)
	if !ok{return}
	proof,valid:=rt.Store.Lookup(digest)
	helper.SuccessWithData(c,vmAccessProof(proof,valid))
}
