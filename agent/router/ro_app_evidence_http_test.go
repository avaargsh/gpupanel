package router

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/1Panel-dev/1Panel/agent/app/model"
	"github.com/1Panel-dev/1Panel/agent/app/service"
	"github.com/1Panel-dev/1Panel/agent/constant"
	"github.com/1Panel-dev/1Panel/agent/global"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"gorm.io/gorm/logger"
)

// TestAppEvidenceRealHTTPAndDocker is an ephemeral-host acceptance probe.
// It mounts the production AppRouter and handler behind an actual loopback
// HTTP listener, querying real Docker via the service, but it is NOT a Core
// login / master Unix socket test and never initiates an installation.
func TestAppEvidenceRealHTTPAndDocker(t *testing.T) {
	name := os.Getenv("GPUPANEL_EVIDENCE_CONTAINER")
	phase := os.Getenv("GPUPANEL_EVIDENCE_PHASE")
	if name == "" {
		t.Skip("requires disposable Docker CI fixture")
	}
	if !regexp.MustCompile(`^gpupanel-evidence-[0-9a-f]{16}$`).MatchString(name) {
		t.Fatal("refusing unexpected evidence container")
	}
	if phase != "running" && phase != "exited" {
		t.Fatal("phase must be running or exited")
	}
	previousApp, previousTask, previousMaster := global.DB, global.TaskDB, global.IsMaster
	t.Cleanup(func() {
		global.DB, global.TaskDB, global.IsMaster = previousApp, previousTask, previousMaster
	})

	openDB := func(filename string, schemas ...interface{}) *gorm.DB {
		t.Helper()
		db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), filename)), &gorm.Config{
			Logger: logger.Default.LogMode(logger.Silent),
		})
		if err != nil {
			t.Fatal(err)
		}
		if err := db.AutoMigrate(schemas...); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			sqlDB, err := db.DB()
			if err == nil { _ = sqlDB.Close() }
		})
		return db
	}
	global.DB = openDB("apps.sqlite", &model.AppInstall{}, &model.Setting{})
	global.TaskDB = openDB("tasks.sqlite", &model.Task{})
	install := model.AppInstall{
		Name: name, AppId: 1, AppDetailId: 1, Version: "ci",
		Status: constant.StatusRunning, ContainerName: name,
		ServiceName: "evidence", Env: "private-ci-credential-must-never-leak",
	}
	if err := global.DB.Omit(clause.Associations).Create(&install).Error; err != nil {
		t.Fatal(err)
	}
	task := model.Task{
		ID: "dddddddd-1111-4111-8111-111111111111", Type: "App",
		Operate: "TaskInstall", ResourceID: install.ID, Status: constant.StatusSuccess,
	}
	if err := global.TaskDB.Create(&task).Error; err != nil {
		t.Fatal(err)
	}
	global.IsMaster = true
	engine := gin.New()
	(&AppRouter{}).InitRouter(engine.Group("/api/v2"))
	listener := httptest.NewServer(engine)
	defer listener.Close()
	url := listener.URL + "/api/v2/apps/installed/evidence/" + strconv.FormatUint(uint64(install.ID), 10)

	request := func() (int, service.AppInstallEvidence, string) {
		t.Helper()
		resp, err := http.Get(url)
		if err != nil { t.Fatal(err) }
		defer resp.Body.Close()
		var envelope struct {
			Code int `json:"code"`
			Data service.AppInstallEvidence `json:"data"`
		}
		raw := new(strings.Builder)
		if err := json.NewDecoder(resp.Body).Decode(&envelope); err != nil { t.Fatal(err) }
		if raw.Len() > 0 { t.Fatal("unexpected raw buffer") }
		b, err := json.Marshal(envelope)
		if err != nil { t.Fatal(err) }
		return resp.StatusCode, envelope.Data, string(b)
	}
	code, observed, body := request()
	if code != http.StatusOK || observed.Verified || len(observed.Containers) != 1 ||
		observed.Containers[0].Name != name || observed.TaskID != task.ID {
		t.Fatalf("invalid Agent HTTP / Docker read: code=%d evidence=%+v", code, observed)
	}
	expected := "CONSISTENT"
	if phase == "exited" { expected = "PARTIAL" }
	if observed.Classification != expected || strings.Contains(body, "private-ci-credential") ||
		strings.Contains(body, "dockerCompose") || strings.Contains(body, "labels") {
		t.Fatalf("wrong classification or secret leak: phase=%s %s", phase, body)
	}
	if observed.Containers[0].State != phase {
		t.Fatalf("real container state mismatch: %+v", observed.Containers)
	}
	// UNKNOWN remains UNKNOWN despite an observed, running container. A GET
	// must not reconcile, create a new Task or erase the original operation.
	if err := global.DB.Model(&install).Update("status", constant.StatusUnknown).Error; err != nil {
		t.Fatal(err)
	}
	_, unknown, _ := request()
	if unknown.Classification != "UNKNOWN" || unknown.Verified {
		t.Fatalf("read-only HTTP request silently reconciled UNKNOWN: %+v", unknown)
	}
	var stored model.AppInstall
	if err := global.DB.First(&stored, install.ID).Error; err != nil { t.Fatal(err) }
	if stored.Status != constant.StatusUnknown || stored.Env != install.Env {
		t.Fatal("GET modified AppInstall metadata")
	}
	var taskCount int64
	if err := global.TaskDB.Model(&model.Task{}).Count(&taskCount).Error; err != nil { t.Fatal(err) }
	if taskCount != 1 { t.Fatal("GET caused a TaskDB side effect") }

	// Non-master HTTP Agent requests are forbidden even if they supply
	// fabricated identity headers; use actual route, not helper-only tests.
	global.IsMaster = false
	req, _ := http.NewRequest(http.MethodGet, url, nil)
	req.Header.Set("X-Panel-User", "admin")
	resp, err := http.DefaultClient.Do(req)
	if err != nil { t.Fatal(err) }
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("remote/nonmaster Agent returned %d; wanted 403", resp.StatusCode)
	}
}
