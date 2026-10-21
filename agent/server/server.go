package server

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/gin-gonic/gin"

	"github.com/avaargsh/GPUPanel/agent/app/repo"
	"github.com/avaargsh/GPUPanel/agent/cron"
	"github.com/avaargsh/GPUPanel/agent/global"
	"github.com/avaargsh/GPUPanel/agent/i18n"
	"github.com/avaargsh/GPUPanel/agent/init/app"
	"github.com/avaargsh/GPUPanel/agent/init/business"
	"github.com/avaargsh/GPUPanel/agent/init/cache"
	"github.com/avaargsh/GPUPanel/agent/init/db"
	"github.com/avaargsh/GPUPanel/agent/init/dir"
	"github.com/avaargsh/GPUPanel/agent/init/firewall"
	"github.com/avaargsh/GPUPanel/agent/init/hook"
	"github.com/avaargsh/GPUPanel/agent/init/lang"
	"github.com/avaargsh/GPUPanel/agent/init/log"
	"github.com/avaargsh/GPUPanel/agent/init/migration"
	"github.com/avaargsh/GPUPanel/agent/init/router"
	"github.com/avaargsh/GPUPanel/agent/init/validator"
	"github.com/avaargsh/GPUPanel/agent/init/viper"
	"github.com/avaargsh/GPUPanel/agent/utils/encrypt"
	"github.com/avaargsh/GPUPanel/agent/utils/files"
	"github.com/avaargsh/GPUPanel/agent/utils/re"
)

const (
	masterSocketDir          = "/etc/gpupanel"
	masterSocketPath         = masterSocketDir + "/agent.sock"
	masterSocketDirPerm      = 0o700
	masterSocketFilePerm     = 0o600
	masterSocketDirPermMask  = 0o077
	masterSocketFilePermMask = 0o077
)

func prepareMasterSocketDir(dir string) error {
	if err := os.MkdirAll(dir, masterSocketDirPerm); err != nil {
		return fmt.Errorf("create master socket dir %s failed: %w", dir, err)
	}
	// Never chmod through an existing symlink. The socket directory is an
	// authority boundary; a linked path could silently redirect permissions.
	dirInfo, err := os.Lstat(dir)
	if err != nil {
		return fmt.Errorf("lstat master socket dir failed: %w", err)
	}
	if !dirInfo.IsDir() || dirInfo.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("master socket dir must be a real directory (not a symlink): %s", dir)
	}
	if err := os.Chmod(dir, masterSocketDirPerm); err != nil {
		return fmt.Errorf("chmod master socket dir %s failed: %w", dir, err)
	}
	info, err := os.Stat(dir)
	if err != nil {
		return fmt.Errorf("stat master socket dir %s failed: %w", dir, err)
	}
	if info.Mode().Perm()&masterSocketDirPermMask != 0 {
		return fmt.Errorf("master socket dir %s permission %#o is too permissive", dir, info.Mode().Perm())
	}
	if stat, ok := info.Sys().(*syscall.Stat_t); ok {
		if int(stat.Uid) != os.Geteuid() {
			return fmt.Errorf(
				"master socket dir %s owner uid %d does not match current process uid %d",
				dir, stat.Uid, os.Geteuid(),
			)
		}
	}
	return nil
}

// ensureMasterSocketVacant never unlinks a socket or another process's file.
// A restart with a stale socket must fail closed until the operator has
// independently confirmed there is no live agent and removed that specific
// socket. This is intentionally safer than probing + unlinking on startup.
func ensureMasterSocketVacant(sockPath string) error {
	_, err := os.Lstat(sockPath)
	if err == nil {
		return fmt.Errorf("master agent socket path already exists (%s); refuse to replace a live or stale socket; inspect the owning process first", sockPath)
	}
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return fmt.Errorf("cannot inspect master agent socket path %s: %w", sockPath, err)
}

func secureMasterSocket(sockPath string) error {
	if err := os.Chmod(sockPath, masterSocketFilePerm); err != nil {
		return fmt.Errorf("chmod master socket %s failed: %w", sockPath, err)
	}
	info, err := os.Stat(sockPath)
	if err != nil {
		return fmt.Errorf("stat master socket %s failed: %w", sockPath, err)
	}
	if info.Mode().Perm()&masterSocketFilePermMask != 0 {
		return fmt.Errorf("master socket %s permission %#o is too permissive", sockPath, info.Mode().Perm())
	}
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return nil
	}
	if int(stat.Uid) != os.Geteuid() {
		return fmt.Errorf(
			"master socket %s owner uid %d does not match current process uid %d",
			sockPath, stat.Uid, os.Geteuid(),
		)
	}
	return nil
}

func Start() {
	re.Init()
	viper.Init()
	dir.Init()
	log.Init()
	global.LOG.Info("agent startup: logger initialized")
	if err := files.CleanupInterruptedDownloads(); err != nil {
		global.LOG.Warnf("clean interrupted remote downloads: %s", err)
	}
	db.Init()
	global.LOG.Info("agent startup: database initialized")
	migration.Init()
	global.LOG.Info("agent startup: migration initialized")
	i18n.Init()
	global.LOG.Info("agent startup: i18n initialized")
	cache.Init()
	global.LOG.Info("agent startup: cache initialized")
	app.Init()
	global.LOG.Info("agent startup: app initialized")
	lang.Init()
	global.LOG.Info("agent startup: language initialized")
	validator.Init()
	global.LOG.Info("agent startup: validator initialized")
	cron.Run()
	global.LOG.Info("agent startup: cron initialized")
	hook.Init()
	global.LOG.Info("agent startup: hook initialized")
	if global.AutoProvisionEnabled() {
		go firewall.Init()
	} else {
		global.LOG.Info("automatic firewall/network/ACME provisioning disabled by operator")
	}
	global.LOG.Info("agent startup: firewall init scheduled")
	InitOthers()
	global.LOG.Info("agent startup: edition initialized")

	rootRouter := router.Routers()
	global.LOG.Info("agent startup: router initialized")

	server := &http.Server{
		Handler: rootRouter,
		// Capture kernel Unix-socket peer credentials as transport evidence.
		// This is deliberately not end-user authentication or session ownership.
		ConnContext: func(ctx context.Context, conn net.Conn) context.Context {
			return withUnixPeerIdentity(ctx, conn)
		},
	}

	if global.CONF.Base.Mode != "stable" {
		gin.SetMode(gin.DebugMode)
	} else {
		gin.SetMode(gin.ReleaseMode)
	}

	if global.IsMaster {
		global.LOG.Infof("agent startup: master mode, preparing unix socket %s", masterSocketPath)
		if err := prepareMasterSocketDir(masterSocketDir); err != nil {
			panic(err)
		}
		if err := ensureMasterSocketVacant(masterSocketPath); err != nil {
			panic(err)
		}
		listener, err := net.Listen("unix", masterSocketPath)
		if err != nil {
			panic(err)
		}
		if err := secureMasterSocket(masterSocketPath); err != nil {
			_ = listener.Close()
			panic(err)
		}
		global.LOG.Infof("agent startup: listening on unix socket %s", masterSocketPath)
		business.Init()
		global.LOG.Info("agent startup: business initialized")
		ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
		defer stop()
		if err := serveOwnedMasterSocket(ctx, server, listener); err != nil {
			global.LOG.Errorf("master agent shutdown failed: %v", err)
		}
		return
	} else {
		server.Addr = fmt.Sprintf("0.0.0.0:%s", global.CONF.Base.Port)
		global.LOG.Infof("agent startup: node mode, preparing https listener %s", server.Addr)
		settingRepo := repo.NewISettingRepo()
		certItem, err := settingRepo.Get(settingRepo.WithByKey("ServerCrt"))
		if err != nil {
			panic(err)
		}
		cert, _ := encrypt.StringDecrypt(certItem.Value)
		keyItem, err := settingRepo.Get(settingRepo.WithByKey("ServerKey"))
		if err != nil {
			panic(err)
		}
		key, _ := encrypt.StringDecrypt(keyItem.Value)
		tlsCert, err := tls.X509KeyPair([]byte(cert), []byte(key))
		if err != nil {
			fmt.Printf("failed to load X.509 key pair: %s\n", err)
			return
		}

		server.TLSConfig = &tls.Config{
			Certificates: []tls.Certificate{tlsCert},
			ClientAuth:   tls.RequireAndVerifyClientCert,
		}
		caItem, _ := settingRepo.GetValueByKey("RootCrt")
		if len(caItem) != 0 {
			caCertPool := x509.NewCertPool()
			rootCrt, _ := encrypt.StringDecrypt(caItem)
			caCertPool.AppendCertsFromPEM([]byte(rootCrt))
			server.TLSConfig.ClientCAs = caCertPool
		}
		business.Init()
		global.LOG.Info("agent startup: business initialized")
		global.LOG.Infof("listen at https://0.0.0.0:%s", global.CONF.Base.Port)
		if err := server.ListenAndServeTLS("", ""); err != nil {
			panic(err)
		}
	}
}
