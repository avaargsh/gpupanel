package v1

import (
	"encoding/json"
	"io"
	"net"
	"net/http"

	"github.com/avaargsh/GPUPanel/core/app/api/v1/helper"
	appauth "github.com/avaargsh/GPUPanel/core/app/auth"
	"github.com/avaargsh/GPUPanel/core/app/principalproof"
	"github.com/avaargsh/GPUPanel/core/global"
	"github.com/avaargsh/GPUPanel/core/init/session/psession"
	"github.com/gin-gonic/gin"
)

type principalBeginRequest struct { UID uint32 `json:"uid"` }

func principalWebSession(c *gin.Context) (*principalproof.Runtime,string,bool) {
	c.Header("Cache-Control","no-store")
	c.Header("Pragma","no-cache")
	host,_,err := net.SplitHostPort(c.Request.RemoteAddr)
	if err != nil || net.ParseIP(host)==nil || !net.ParseIP(host).IsLoopback() ||
		c.GetHeader("Forwarded")!="" || c.GetHeader("X-Forwarded-For")!="" ||
		c.GetHeader("X-Real-IP")!="" || c.GetHeader("CF-Connecting-IP")!="" {
		c.AbortWithStatus(http.StatusForbidden)
		return nil,"",false
	}
	u,err := appauth.RequireAPIKeySession(c)
	if err != nil || u.ID!=psession.SuperAdminSessionUserID || u.Role!="ADMIN" {
		c.AbortWithStatus(http.StatusForbidden)
		return nil,"",false
	}
	digest,err := global.SESSION.VerifiedSessionDigest(c)
	if err!=nil { c.AbortWithStatus(http.StatusForbidden); return nil,"",false }
	rt:=principalproof.Current()
	if rt==nil { c.AbortWithStatus(http.StatusServiceUnavailable); return nil,"",false }
	return rt,digest,true
}

func (b *BaseApi) BeginNativePrincipal(c *gin.Context) {
	rt,digest,ok:=principalWebSession(c);if !ok{return}
	c.Request.Body=http.MaxBytesReader(c.Writer,c.Request.Body,128)
	var req principalBeginRequest
	dec:=json.NewDecoder(c.Request.Body);dec.DisallowUnknownFields()
	if dec.Decode(&req)!=nil || dec.Decode(new(interface{}))!=io.EOF {
		c.AbortWithStatus(http.StatusBadRequest);return
	}
	token,err:=rt.Store.Begin(digest,req.UID)
	if err!=nil {c.AbortWithStatus(http.StatusConflict);return}
	helper.SuccessWithData(c,gin.H{"challenge":token,"socketPath":rt.SocketPath,
		"expiresInSeconds":60,"executionAuthorized":false})
}
func (b *BaseApi) NativePrincipalStatus(c *gin.Context) {
	rt,digest,ok:=principalWebSession(c);if !ok{return}
	proof,exists:=rt.Store.Lookup(digest)
	if !exists {helper.SuccessWithData(c,gin.H{"state":"Unbound","executionAuthorized":false});return}
	helper.SuccessWithData(c,gin.H{"state":"PeerObserved","proof":proof})
}
func (b *BaseApi) RevokeNativePrincipal(c *gin.Context) {
	rt,digest,ok:=principalWebSession(c);if !ok{return}
	rt.Store.Revoke(digest)
	helper.Success(c)
}
