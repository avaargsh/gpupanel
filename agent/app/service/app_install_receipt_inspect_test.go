package service

import (
	"strings"
	"testing"

	"github.com/1Panel-dev/1Panel/agent/app/dto/request"
	"github.com/1Panel-dev/1Panel/agent/app/model"
	"github.com/1Panel-dev/1Panel/agent/app/task"
	"github.com/1Panel-dev/1Panel/agent/constant"
	"github.com/1Panel-dev/1Panel/agent/global"
)

func unlinkedInstallTask(name, status string) model.Task {
	return model.Task{
		ID: "a1111111-1111-4111-8111-111111111111",
		Name: name,
		Type: task.TaskScopeApp,
		Operate: task.TaskInstall,
		Status: status,
	}
}

func TestAppInstallAdmissionReceiptClassifiesWithoutClaimingOutcome(t *testing.T) {
	appDB, _, existing := operationStatusTestDB(t)
	tests := []struct {
		name, requestName, expected string
	}{
		{"matching name", strings.ToUpper(existing.Name), "1 record(s) have this name"},
		{"absent name", "different-name", "no matching name"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			res, ok := inspectUnlinkedInstallReceipt(unlinkedInstallTask(tc.requestName, constant.StatusExecuting), appDB)
			if !ok || res == nil {
				t.Fatal("reserved unlinked task is not inspectable")
			}
			text := strings.Join(res.Lines, "\n")
			if !strings.Contains(text, tc.expected) ||
				!strings.Contains(text, "NOT linked to this task") && tc.name == "matching name" {
				t.Fatalf("wrong or unjustified classification: %s", text)
			}
			if !strings.Contains(text, "does not prove") ||
				!strings.Contains(text, "before any new install request") {
				t.Fatalf("missing ambiguity guard: %s", text)
			}
			if res.Scope != installAdmissionLogScope || !res.End || res.TaskStatus != constant.StatusExecuting ||
				res.Path != "" {
				t.Fatalf("unsafe/untruthful synthetic log result: %+v", res)
			}
		})
	}
}

func TestAppInstallAdmissionReceiptDoesNotConvertTaskFailureIntoDockerFailure(t *testing.T) {
	appDB, _, _ := operationStatusTestDB(t)
	r := unlinkedInstallTask("not-present", constant.StatusFailed)
	res, ok := inspectUnlinkedInstallReceipt(r, appDB)
	if !ok || res.TaskStatus != constant.StatusFailed {
		t.Fatalf("task status changed: %+v", res)
	}
	if !strings.Contains(strings.Join(res.Lines, " "), "Partial Docker or filesystem effects are still possible") {
		t.Fatalf("receipt suggests fail means no effects: %+v", res.Lines)
	}
}

func TestAppInstallAdmissionReceiptLookupUnavailableRemainsUnknown(t *testing.T) {
	r := unlinkedInstallTask("project", constant.StatusFailed)
	res, ok := inspectUnlinkedInstallReceipt(r, nil)
	if !ok || !strings.Contains(strings.Join(res.Lines, " "), "state remain UNKNOWN") {
		t.Fatalf("unavailable app DB classified as empty: %+v", res)
	}
}

func TestAppInstallAdmissionReceiptNeverMasksActualLogsOrOtherOperations(t *testing.T) {
	appDB, _, _ := operationStatusTestDB(t)
	tests := []model.Task{
		{ID: "other", Type: task.TaskScopeApp, Operate: task.TaskUpdate, Name: "app"},
		{ID: "other", Type: task.TaskScopeCompose, Operate: task.TaskInstall, Name: "app"},
		{ID: "other", Type: task.TaskScopeApp, Operate: task.TaskInstall, Name: "app", ResourceID: 2},
		{ID: "other", Type: task.TaskScopeApp, Operate: task.TaskInstall, Name: "app", LogFile: "/tmp/existing.log"},
	}
	for _, candidate := range tests {
		if _, ok := inspectUnlinkedInstallReceipt(candidate, appDB); ok {
			t.Fatalf("masked real task or unrelated operation: %+v", candidate)
		}
	}
}

func TestAppInstallAdmissionReceiptReadByLineAPIPath(t *testing.T) {
	appDB, taskDB, _ := operationStatusTestDB(t)
	oldAppDB, oldTaskDB := global.DB, global.TaskDB
	global.DB, global.TaskDB = appDB, taskDB
	t.Cleanup(func() { global.DB, global.TaskDB = oldAppDB, oldTaskDB })

	taskReceipt := unlinkedInstallTask("missing-app", constant.StatusExecuting)
	if err := taskDB.Create(&taskReceipt).Error; err != nil {
		t.Fatal(err)
	}
	res, err := (&TaskLogService{}).ReadByLine(request.TaskLogReadReq{TaskReq: request.TaskReq{TaskID: taskReceipt.ID}})
	if err != nil || res == nil {
		t.Fatalf("task-log read rejected a durable admission: %v", err)
	}
	if res.Scope != installAdmissionLogScope || res.Total != 1 || res.TotalLines != len(res.Lines) {
		t.Fatalf("unexpected synthetic log pagination: %+v", res)
	}
}
