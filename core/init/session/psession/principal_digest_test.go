package psession

import (
	"net/http/httptest"
	"testing"

	"github.com/avaargsh/GPUPanel/core/constant"
	"github.com/gin-gonic/gin"
)

func TestVerifiedSessionDigestUsesLiveInstanceNotAccountID(t *testing.T) {
	p := NewPSession("")
	makeSession := func() (*gin.Context, string) {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("GET", "/", nil)
		if err := p.SetFresh(c, SessionUser{ID:SuperAdminSessionUserID,Name:"admin",Role:"ADMIN"}, false, 3600);err!=nil{t.Fatal(err)}
		for _, cookie := range w.Result().Cookies() {
			if cookie.Name==constant.SessionName {c.Request.AddCookie(cookie)}
		}
		d,err:=p.VerifiedSessionDigest(c)
		if err!=nil {t.Fatal(err)}
		return c,d
	}
	first,d1:=makeSession()
	second,d2:=makeSession()
	if d1==d2 || len(d1)!=64 || len(d2)!=64 {t.Fatal("shared account ID was used rather than specific sessions")}
	if err:=p.Delete(first);err!=nil{t.Fatal(err)}
	if _,err:=p.VerifiedSessionDigest(first);err==nil{t.Fatal("revoked cookie still matched")}
	if _,err:=p.VerifiedSessionDigest(second);err!=nil{t.Fatal("independent session revoked")}
}
