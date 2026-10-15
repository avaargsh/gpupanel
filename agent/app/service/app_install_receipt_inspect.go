package service

import (
	"fmt"
	"strings"

	"github.com/1Panel-dev/1Panel/agent/app/dto/response"
	"github.com/1Panel-dev/1Panel/agent/app/model"
	"github.com/1Panel-dev/1Panel/agent/app/task"
	"gorm.io/gorm"
)

const installAdmissionLogScope = "admission"

// inspectUnlinkedInstallReceipt is a read-only diagnostic for a task claim
// persisted before any execution log or AppInstall resource was linked.
//
// It deliberately DOES NOT infer Docker success/failure from TaskDB or the
// presence/absence of an AppInstall row, and performs no retry or cleanup.
// AppInstall rows from a same-name earlier attempt are NOT proof that this
// specific task created them.
func inspectUnlinkedInstallReceipt(receipt model.Task, appDB *gorm.DB) (*response.FileLineContent, bool) {
	if receipt.Type != task.TaskScopeApp || receipt.Operate != task.TaskInstall ||
		receipt.ResourceID != 0 || strings.TrimSpace(receipt.LogFile) != "" {
		return nil, false
	}

	lines := []string{
		"[APP-INSTALL-ADMISSION] An installation task ID was reserved, but no execution log or AppInstall resource ID is linked.",
		fmt.Sprintf("Recorded TaskDB status: %s. This does not prove that Docker installation succeeded or failed.", receipt.Status),
	}
	if appDB == nil {
		lines = append(lines, "AppInstall lookup: unavailable. Application and Docker state remain UNKNOWN.")
	} else {
		var count int64
		err := appDB.Model(&model.AppInstall{}).
			Where("LOWER(name) = ?", strings.ToLower(strings.TrimSpace(receipt.Name))).
			Count(&count).Error
		switch {
		case err != nil:
			// Do not include raw DB errors; they may contain internal paths.
			lines = append(lines, "AppInstall lookup: unavailable. Application and Docker state remain UNKNOWN.")
		case count == 0:
			lines = append(lines, "AppInstall lookup: no matching name in the application DB. Partial Docker or filesystem effects are still possible.")
		default:
			lines = append(lines, fmt.Sprintf(
				"AppInstall lookup: %d record(s) have this name. They are NOT linked to this task; check ownership and real runtime state.", count))
		}
	}
	lines = append(lines,
		"Reconciliation required: inspect the original node's installed applications, task history, containers and retained data before any new install request.",
	)

	return &response.FileLineContent{
		End:        true,
		Path:       "",
		Total:      1,
		TotalLines: len(lines),
		TaskStatus: receipt.Status,
		Lines:      lines,
		Scope:      installAdmissionLogScope,
	}, true
}
