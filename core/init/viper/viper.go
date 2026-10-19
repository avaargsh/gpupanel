package viper

import (
	"bytes"
	"fmt"
	"os"
	"path"

	"github.com/avaargsh/GPUPanel/core/cmd/server/conf"
	"github.com/avaargsh/GPUPanel/core/global"
	"github.com/fsnotify/fsnotify"
	"github.com/spf13/viper"
	"gopkg.in/yaml.v3"
)

func Init() {
	baseDir := "/opt"
	port := "9999"
	mode := ""
	version := "v2.0.0"
	username, password, entrance, language, edition := "", "", "", "zh", ""
	v := viper.NewWithOptions()
	v.SetConfigType("yaml")

	config := global.ServerConfig{}
	if err := yaml.Unmarshal(conf.AppYaml, &config); err != nil {
		panic(err)
	}
	if config.Base.Mode != "" {
		mode = config.Base.Mode
	}
	_, err := os.Stat("/opt/gpupanel/conf/app.yaml")
	if mode == "dev" && err == nil {
		v.SetConfigName("app")
		v.AddConfigPath(path.Join("/opt/gpupanel/conf"))
		if err := v.ReadInConfig(); err != nil {
			panic(fmt.Errorf("fatal error config file: %s", err))
		}
	} else {
		// Non-dev mode: use embedded app.yaml defaults, not a global compatibility control script.
		baseDir = config.Base.InstallDir
		port = config.Conn.Port
		version = config.Base.Version
		username = config.Base.Username
		password = config.Base.Password
		entrance = config.Conn.Entrance
		language = config.Base.Language
		edition = config.Base.Edition

		reader := bytes.NewReader(conf.AppYaml)
		if err := v.ReadConfig(reader); err != nil {
			panic(fmt.Errorf("fatal error config file: %s", err))
		}
	}
	v.OnConfigChange(func(e fsnotify.Event) {
		if err := v.Unmarshal(&global.CONF); err != nil {
			panic(err)
		}
	})
	serverConfig := global.ServerConfig{}
	if err := v.Unmarshal(&serverConfig); err != nil {
		panic(err)
	}
	_, err = os.Stat("/opt/gpupanel/conf/app.yaml")
	if mode == "dev" && err == nil {
		if serverConfig.Base.InstallDir != "" {
			baseDir = serverConfig.Base.InstallDir
		}
		if serverConfig.Conn.Port != "" {
			port = serverConfig.Conn.Port
		}
		if serverConfig.Base.Version != "" {
			version = serverConfig.Base.Version
		}
		if serverConfig.Base.Username != "" {
			username = serverConfig.Base.Username
		}
		if serverConfig.Base.Password != "" {
			password = serverConfig.Base.Password
		}
		if serverConfig.Conn.Entrance != "" {
			entrance = serverConfig.Conn.Entrance
		}
	}

	global.CONF = serverConfig
	global.CONF.Base.InstallDir = baseDir
	global.CONF.Base.IsDemo = v.GetBool("base.is_demo")
	global.CONF.Base.IsFxplay = v.GetBool("base.is_fxplay")
	global.CONF.Base.IsOffline = v.GetBool("base.is_offline")
	if edition == "intl" {
		global.CONF.Base.Edition = "intl"
	} else {
		global.CONF.Base.Edition = "cn"
	}
	global.CONF.Base.Version = version
	global.CONF.Base.Username = username
	global.CONF.Base.Password = password
	global.CONF.Base.Language = language
	global.CONF.Base.ChangeUserInfo = loadChangeInfo()
	global.CONF.Conn.Entrance = entrance
	global.CONF.Conn.Port = port
	global.Viper = v
}

func loadChangeInfo() string {
	// CHANGE_USER_INFO is no longer read from a global control script.
	// User info changes are handled through the settings API instead.
	return ""
}
