package hostops

import (
	"context"
	"errors"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type testRunner struct {
	calls            atomic.Int32
	started, release chan struct{}
	result           Result
	err              error
}

func (*testRunner) Prepare(context.Context, string, string) (string, string, error) {
	return "expected", "impact", nil
}
func (f *testRunner) Execute(ctx context.Context, r Receipt) (Result, error) {
	f.calls.Add(1)
	if f.started != nil {
		close(f.started)
		select {
		case <-f.release:
		case <-ctx.Done():
			return Result{Unknown: true}, ctx.Err()
		}
	}
	return f.result, f.err
}
func testEngine(t *testing.T) (Engine, *testRunner, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "task.db")
	db, err := gorm.Open(sqlite.Open(path), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&Receipt{}); err != nil {
		t.Fatal(err)
	}
	sql, _ := db.DB()
	t.Cleanup(func() { sql.Close() })
	f := &testRunner{}
	return Engine{DB: db, Runner: f}, f, path
}
func makePlan(t *testing.T, e Engine, key string) Receipt {
	t.Helper()
	r, err := e.Plan(context.Background(), "admin:session", PlanRequest{Kind: Diagnose, Target: "local", Key: key})
	if err != nil {
		t.Fatal(err)
	}
	return r
}
func TestConfirmationIsOwnerBoundExpiredAndReplaySafe(t *testing.T) {
	e, f, path := testEngine(t)
	r := makePlan(t, e, "unique-key-01")
	if again := makePlan(t, e, "unique-key-01"); again.ID != r.ID {
		t.Fatal("idempotency changed identity")
	}
	for _, args := range []struct {
		owner string
		c     ConfirmRequest
	}{{"other", ConfirmRequest{r.Hash, true}}, {"admin:session", ConfirmRequest{r.Hash, false}}, {"admin:session", ConfirmRequest{"forged", true}}} {
		if _, err := e.Execute(context.Background(), args.owner, r.ID, args.c); err == nil {
			t.Fatal("invalid confirmation accepted")
		}
	}
	if f.calls.Load() != 0 {
		t.Fatal("executed without confirmation")
	}
	done, err := e.Execute(context.Background(), "admin:session", r.ID, ConfirmRequest{r.Hash, true})
	if err != nil || done.State != "completed" || done.Verified {
		t.Fatalf("read-only result: %+v %v", done, err)
	}
	if _, err := e.Execute(context.Background(), "admin:session", r.ID, ConfirmRequest{r.Hash, true}); err != nil {
		t.Fatal(err)
	}
	if f.calls.Load() != 1 {
		t.Fatal("replay executed again")
	}
	db, err := gorm.Open(sqlite.Open(path), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sql, _ := db.DB()
	defer sql.Close()
	restored, err := (Engine{DB: db}).Get("admin:session", r.ID)
	if err != nil || restored.State != "completed" {
		t.Fatal("receipt lost across reopen")
	}
	if _, err := e.Get("other", r.ID); err == nil {
		t.Fatal("foreign receipt readable")
	}
	expired := makePlan(t, e, "unique-key-02")
	expired.ExpiresAt = time.Now().UTC().Add(-time.Second)
	expired.Hash = planHash(expired)
	e.DB.Save(&expired)
	if _, err := e.Execute(context.Background(), "admin:session", expired.ID, ConfirmRequest{expired.Hash, true}); err == nil {
		t.Fatal("expired plan executed")
	}
}
func TestStoredParameterTamperingNeverExecutes(t *testing.T) {
	for _, field := range []string{"owner", "kind", "target", "host", "expected", "impact", "expires_at"} {
		t.Run(field, func(t *testing.T) {
			e, f, _ := testEngine(t)
			r := makePlan(t, e, "unique-key-03")
			var value interface{} = "tampered"
			if field == "expires_at" {
				value = time.Now().Add(time.Hour)
			}
			e.DB.Model(&Receipt{}).Where("id = ?", r.ID).Update(field, value)
			if _, err := e.Execute(context.Background(), "admin:session", r.ID, ConfirmRequest{r.Hash, true}); err == nil || f.calls.Load() != 0 {
				t.Fatal("tampered plan executed")
			}
		})
	}
}
func TestGlobalClaimAndUnknownRecovery(t *testing.T) {
	e, f, _ := testEngine(t)
	f.started = make(chan struct{})
	f.release = make(chan struct{})
	f.result = Result{Verified: true}
	first := makePlan(t, e, "unique-key-04")
	second := makePlan(t, e, "unique-key-05")
	finished := make(chan error, 1)
	go func() {
		_, err := e.Execute(context.Background(), "admin:session", first.ID, ConfirmRequest{first.Hash, true})
		finished <- err
	}()
	<-f.started
	if _, err := e.Execute(context.Background(), "admin:session", second.ID, ConfirmRequest{second.Hash, true}); err == nil {
		t.Fatal("concurrent execution accepted")
	}
	close(f.release)
	if err := <-finished; err != nil {
		t.Fatal(err)
	}
	if f.calls.Load() != 1 {
		t.Fatal("capacity failed")
	}
	e.DB.Model(&Receipt{}).Where("id = ?", second.ID).Updates(map[string]interface{}{"state": "running", "deadline": time.Now().UTC().Add(-time.Second)})
	recovered, err := e.Get("admin:session", second.ID)
	if err != nil || recovered.State != "unknown" {
		t.Fatalf("crash recovery: %+v %v", recovered, err)
	}
	e.Execute(context.Background(), "admin:session", second.ID, ConfirmRequest{second.Hash, true})
	if f.calls.Load() != 1 {
		t.Fatal("unknown operation replayed")
	}
}
func TestTimeoutAndPartialResultNeverVerified(t *testing.T) {
	e, f, _ := testEngine(t)
	r := makePlan(t, e, "unique-key-06")
	f.err = errors.New("response lost")
	f.result = Result{Unknown: true, Verified: true}
	done, err := e.Execute(context.Background(), "admin:session", r.ID, ConfirmRequest{r.Hash, true})
	if err != nil || done.State != "unknown" || done.Verified {
		t.Fatalf("uncertainty hidden: %+v %v", done, err)
	}
}
func TestOnlyAllowlistedIntentAndCapacity(t *testing.T) {
	e, _, _ := testEngine(t)
	for _, req := range []PlanRequest{{Kind: "shell", Target: "rm -rf /", Key: "unique-key-07"}, {Kind: Diagnose, Target: "remote", Key: "unique-key-07"}, {Kind: Restart, Target: "short-name", Key: "unique-key-07"}, {Kind: ContainerDiagnose, Target: "unsafe;id", Key: "unique-key-07"}, {Kind: ContainerDiagnose, Target: "remote", Key: "unique-key-07"}} {
		if _, err := e.Plan(context.Background(), "admin:session", req); err == nil {
			t.Fatal("uncontrolled intent accepted")
		}
	}
	rows := make([]Receipt, 500)
	for i := range rows {
		rows[i] = Receipt{ID: time.Unix(int64(i), 0).String(), Owner: "capacity", Key: time.Unix(int64(i), 0).String()}
	}
	if err := e.DB.Create(&rows).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := e.Plan(context.Background(), "admin:session", PlanRequest{Kind: Diagnose, Target: "local", Key: "unique-key-08"}); err == nil {
		t.Fatal("unbounded receipt growth")
	}
}
