package v1

import "github.com/avaargsh/GPUPanel/core/app/service"

type ApiGroup struct {
	BaseApi
}

var ApiGroupApp = new(ApiGroup)

var (
	runtimeDiagnosticsService = service.NewIRuntimeDiagnosticsService()
	authService               = service.NewIAuthService()
	backupService             = service.NewIBackupService()
	settingService            = service.NewISettingService()
	logService                = service.NewILogService()
	upgradeService            = service.NewIUpgradeService()
	groupService              = service.NewIGroupService()
	commandService            = service.NewICommandService()
	scriptService             = service.NewIScriptService()
)
