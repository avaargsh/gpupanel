package db

import (
	"path"

	"github.com/avaargsh/GPUPanel/core/global"
	"github.com/avaargsh/GPUPanel/core/utils/common"
)

func Init() {
	global.DB = common.LoadDBConnByPath(path.Join(global.CONF.Base.InstallDir, "gpupanel/db/core.db"), "core")
	global.TaskDB = common.LoadDBConnByPath(path.Join(global.CONF.Base.InstallDir, "gpupanel/db/task.db"), "task")
	global.AgentDB = common.LoadDBConnByPath(path.Join(global.CONF.Base.InstallDir, "gpupanel/db/agent.db"), "agent")
	global.AlertDB = common.LoadDBConnByPath(path.Join(global.CONF.Base.InstallDir, "gpupanel/db/alert.db"), "alert")
}
