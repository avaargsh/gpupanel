package job

import (
	"github.com/avaargsh/GPUPanel/agent/app/service"
	"github.com/avaargsh/GPUPanel/agent/global"
)

type app struct{}

func NewAppStoreJob() *app {
	return &app{}
}

func (a *app) Run() {
	global.LOG.Info("AppStore scheduled task in progress ...")
	if err := service.NewIAppService().SyncAppListFromRemote(""); err != nil {
		global.LOG.Errorf("AppStore sync failed %s", err.Error())
	}
	global.LOG.Info("AppStore scheduled task has completed")
}
