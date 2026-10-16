package v1

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/avaargsh/GPUPanel/agent/app/hostops"
	"github.com/avaargsh/GPUPanel/agent/global"
	"github.com/avaargsh/GPUPanel/agent/utils/terminal"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func TestHostOperationsPrivateHTTPIntentValidation(t *testing.T) {
	old := global.TaskDB
	defer func() { global.TaskDB = old }()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "task.db")), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	global.TaskDB = db
	if err := db.AutoMigrate(&hostops.Receipt{}); err != nil {
		t.Fatal(err)
	}
	sql, _ := db.DB()
	defer sql.Close()
	r := gin.New()
	api := &BaseApi{}
	r.POST("/plan", api.PlanHostOperation)
	r.GET("/list", api.ListHostOperations)
	for _, test := range []struct {
		body, owner string
		want        int
	}{{`{"kind":"host.diagnose","target":"local","key":"http-test-key"}`, "", 403}, {`{"kind":"host.diagnose","target":"local","key":"http-test-key","command":"malicious"}`, "session", 400}, {`{"kind":"host.diagnose","target":"local","key":"http-test-key"}{}`, "session", 400}, {`{"kind":"shell","target":"local","key":"http-test-key"}`, "session", 409}, {`{"kind":"host.diagnose","target":"local","key":"http-test-key"}`, "session", 200}, {strings.Repeat("x", 3000), "session", 400}} {
		w := httptest.NewRecorder()
		req := httptest.NewRequest("POST", "/plan", bytes.NewBufferString(test.body))
		if test.owner != "" {
			req.Header.Set(terminal.HeaderUserID, "__super_admin__")
			req.Header.Set(terminal.HeaderAuthSessionID, test.owner)
		}
		r.ServeHTTP(w, req)
		if w.Code != test.want {
			t.Fatalf("status %d want %d: %s", w.Code, test.want, w.Body.String())
		}
	}
	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/list", nil)
	req.Header.Set(terminal.HeaderUserID, "__super_admin__")
	req.Header.Set(terminal.HeaderAuthSessionID, "session")
	r.ServeHTTP(w, req)
	var result struct {
		Data []map[string]interface{} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Data) != 1 {
		t.Fatal("unexpected receipts")
	}
	for _, k := range []string{"Owner", "owner", "Key", "key"} {
		if _, ok := result.Data[0][k]; ok {
			t.Fatal("private identity leaked")
		}
	}
}
