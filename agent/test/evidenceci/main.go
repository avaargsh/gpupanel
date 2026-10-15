// This command is a deliberately gated CI fixture, not a production Agent.
// It starts the real Agent AppRouter on an owner-only temporary Unix socket,
// backed by disposable SQLite records and read-only Docker observation.
package main

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"syscall"
	"time"

	"github.com/avaargsh/GPUPanel/agent/app/model"
	"github.com/avaargsh/GPUPanel/agent/constant"
	"github.com/avaargsh/GPUPanel/agent/global"
	agentrouter "github.com/avaargsh/GPUPanel/agent/router"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"gorm.io/gorm/logger"
)

func main() {
	if err := run(); err != nil {
		_, _ = fmt.Fprintln(os.Stderr, "CI-only evidence harness:", err)
		os.Exit(2)
	}
}

func run() error {
	if os.Getenv("GPUPANEL_E2E_CI_ONLY") != "1" {
		return errors.New("CI-only opt-in is required")
	}
	name := os.Getenv("GPUPANEL_EVIDENCE_CONTAINER")
	if !regexp.MustCompile(`^gpupanel-evidence-[0-9a-f]{16}$`).MatchString(name) {
		return errors.New("disposable Docker fixture name is missing or invalid")
	}
	socket := os.Getenv("GPUPANEL_E2E_SOCKET")
	if !filepath.IsAbs(socket) || filepath.Base(socket) != "agent.sock" || filepath.Clean(socket) != socket {
		return errors.New("expected an absolute temporary agent.sock")
	}
	parent := filepath.Dir(socket)
	dir, err := os.Lstat(parent)
	if err != nil || !dir.IsDir() || dir.Mode()&os.ModeSymlink != 0 || dir.Mode().Perm()&0o077 != 0 {
		return errors.New("CI socket parent must be a real private directory")
	}
	if _, err := os.Lstat(socket); err == nil {
		return errors.New("refusing to replace existing socket")
	} else if !os.IsNotExist(err) {
		return err
	}
	open := func(file string, schemas ...interface{}) (*gorm.DB, error) {
		db, err := gorm.Open(sqlite.Open(filepath.Join(parent, file)), &gorm.Config{
			Logger: logger.Default.LogMode(logger.Silent),
		})
		if err != nil {
			return nil, err
		}
		if err := db.AutoMigrate(schemas...); err != nil {
			return nil, err
		}
		return db, nil
	}
	global.DB, err = open("apps.sqlite", &model.AppInstall{}, &model.Setting{})
	if err != nil {
		return err
	}
	global.TaskDB, err = open("tasks.sqlite", &model.Task{})
	if err != nil {
		return err
	}
	global.IsMaster = true
	global.LOG = logrus.New()
	install := model.AppInstall{
		Name: name, AppId: 1, AppDetailId: 1, Version: "ci",
		Status: constant.StatusRunning, ContainerName: name,
		ServiceName: "evidence", Env: "DO_NOT_RETURN_CI_SECRET",
	}
	if err := global.DB.Omit(clause.Associations).Create(&install).Error; err != nil {
		return err
	}
	task := model.Task{
		ID:   "e1111111-1111-4111-8111-111111111111",
		Type: "App", Operate: "TaskInstall", ResourceID: install.ID,
		Status: constant.StatusSuccess,
	}
	if err := global.TaskDB.Create(&task).Error; err != nil {
		return err
	}
	gin.SetMode(gin.ReleaseMode)
	engine := gin.New()
	(&agentrouter.AppRouter{}).InitRouter(engine.Group("/api/v1"))
	listener, err := net.Listen("unix", socket)
	if err != nil {
		return err
	}
	defer listener.Close()
	defer os.Remove(socket)
	if err := os.Chmod(socket, 0o600); err != nil {
		return err
	}
	info, err := os.Stat(socket)
	if err != nil || info.Mode().Perm() != 0o600 {
		return errors.New("temporary Agent socket is not owner-only")
	}
	server := &http.Server{Handler: engine, ReadHeaderTimeout: 5 * time.Second}
	stopping := make(chan os.Signal, 1)
	signal.Notify(stopping, syscall.SIGTERM, syscall.SIGINT)
	defer signal.Stop(stopping)
	go func() {
		<-stopping
		_ = server.Close()
	}()
	err = server.Serve(listener)
	if err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
