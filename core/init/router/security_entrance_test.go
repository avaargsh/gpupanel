package router

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/avaargsh/GPUPanel/core/app/model"
	"github.com/avaargsh/GPUPanel/core/app/repo"
	"github.com/avaargsh/GPUPanel/core/global"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func TestSecurityEntranceHandsOffToReactLoginWithoutGrantingSession(t *testing.T) {
	oldDB := global.DB
	t.Cleanup(func() { global.DB = oldDB })
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sql, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer sql.Close()
	if err := db.AutoMigrate(&model.Setting{}); err != nil {
		t.Fatal(err)
	}
	global.DB = db
	settings := repo.NewISettingRepo()
	for key, value := range map[string]string{"SecurityEntrance": "fixture-entry", "SSL": "Disable"} {
		if err := settings.UpdateOrCreate(key, value); err != nil {
			t.Fatal(err)
		}
	}
	engine := gin.New()
	setWebStatic(engine.Group(""))
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/fixture-entry", nil))
	if recorder.Code != http.StatusFound || recorder.Header().Get("Location") != "/login" {
		t.Fatalf("entrance must hand off to actual React login, status=%d location=%q", recorder.Code, recorder.Header().Get("Location"))
	}
	found := false
	for _, cookie := range recorder.Result().Cookies() {
		if cookie.Name != "SecurityEntrance" {
			t.Fatalf("entrance granted unexpected cookie %s", cookie.Name)
		}
		value, err := url.QueryUnescape(cookie.Value)
		if err != nil {
			t.Fatal(err)
		}
		decoded, err := base64.StdEncoding.DecodeString(value)
		if err != nil || string(decoded) != "fixture-entry" || !cookie.HttpOnly || cookie.Path != "/" {
			t.Fatal("entrance cookie must bind the verified route and stay HttpOnly")
		}
		found = true
	}
	if !found {
		t.Fatal("verified entrance cookie missing")
	}
	if err := settings.UpdateOrCreate("SecurityEntrance", "rotated-entry"); err != nil {
		t.Fatal(err)
	}
	stale := httptest.NewRecorder()
	engine.ServeHTTP(stale, httptest.NewRequest(http.MethodGet, "/fixture-entry", nil))
	if stale.Code == http.StatusFound || len(stale.Result().Cookies()) != 0 {
		t.Fatal("rotated entrance was still accepted")
	}
}
