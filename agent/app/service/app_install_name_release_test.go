package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/avaargsh/GPUPanel/agent/app/model"
	"github.com/avaargsh/GPUPanel/agent/constant"
	"gorm.io/gorm"
)

const (
	releaseTaskID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
	releaseID1 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
	releaseID2 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
)

func releaseTestDB(t *testing.T) (*gorm.DB, *gorm.DB) {
	t.Helper()
	taskDB, _ := appInstallAdmissionDB(t)
	if err := taskDB.AutoMigrate(&model.AppInstallNameReleaseAudit{}); err != nil { t.Fatal(err) }
	return taskDB, nameReviewAppDB(t)
}

func releaseTestRequest() appInstallNameReleaseRequest {
	return appInstallNameReleaseRequest{
		RequestID: releaseID1, Name: " jupyter ", OwnerTaskID: releaseTaskID,
	}
}

func releaseObserver() appInstallNameReleaseObserver {
	return func(_ context.Context, key, owner string) (appInstallNameReleaseProbe, error) {
		return appInstallNameReleaseProbe{
			NameKey: key, OwnerTaskID: owner, ObservedAt: time.Now().UTC(),
			DockerAbsent: true, ComposeAbsent: true,
			FilesystemAbsent: true, NoActiveOperations: true,
		}, nil
	}
}

func releaseApprover() appInstallNameReleaseApprover {
	return func(_ context.Context, _ appInstallNameReleaseRequest, digest string) (string, error) {
		if len(digest) != 64 { return "", fmt.Errorf("bad evidence digest") }
		return "test-admin", nil
	}
}

func assertNoRelease(t *testing.T, db *gorm.DB) {
	t.Helper()
	var rows int64
	if err := db.Model(&model.AppInstallNameClaim{}).Count(&rows).Error; err != nil { t.Fatal(err) }
	if rows != 1 { t.Fatalf("denied release removed live name owner: %d", rows) }
	if err := db.Model(&model.AppInstallNameReleaseAudit{}).Count(&rows).Error; err != nil { t.Fatal(err) }
	if rows != 0 { t.Fatalf("denied release left audit indicating success: %d", rows) }
}

func TestNameReleaseRequiresTwoIndependentFreshObservationsAndWritesAuditAtomically(t *testing.T) {
	taskDB, appDB := releaseTestDB(t)
	addNameOwner(t, taskDB, "jupyter", releaseTaskID, constant.StatusSuccess, 44)
	attempts := 0
	observer := func(ctx context.Context, key, owner string) (appInstallNameReleaseProbe, error) {
		attempts++
		return releaseObserver()(ctx, key, owner)
	}
	req := releaseTestRequest()
	if err := releaseAppInstallNameAfterReview(context.Background(), taskDB, appDB,
		req, observer, releaseApprover()); err != nil { t.Fatal(err) }
	if attempts != 2 { t.Fatalf("expected fresh observations before/after approval: %d", attempts) }
	var claimCount int64
	if err := taskDB.Model(&model.AppInstallNameClaim{}).Count(&claimCount).Error; err != nil { t.Fatal(err) }
	if claimCount != 0 { t.Fatal("name CAS did not release claim") }
	var audit model.AppInstallNameReleaseAudit
	if err := taskDB.First(&audit, "request_id = ?", req.RequestID).Error; err != nil { t.Fatal(err) }
	if audit.NameKey != "jupyter" || audit.OwnerTaskID != releaseTaskID ||
		audit.OperatorID != "test-admin" || len(audit.EvidenceSHA256) != 64 {
		t.Fatalf("release audit incomplete: %+v", audit)
	}
	// Original Task history remains and is not changed to VERIFIED.
	var task model.Task
	if err := taskDB.First(&task, "id = ?", releaseTaskID).Error; err != nil { t.Fatal(err) }
	if task.Status != constant.StatusSuccess { t.Fatal("release overwrote original task outcome") }
	next := "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
	if err := claimAppInstallTask(taskDB, next, "JUPYTER"); err != nil {
		t.Fatalf("verified release did not permit a new independent admission: %v", err)
	}
	// Request-ID replay can never release the new owner's claim.
	if err := releaseAppInstallNameAfterReview(context.Background(), taskDB, appDB,
		req, releaseObserver(), releaseApprover()); !errors.Is(err, ErrAppInstallNameReleaseDenied) {
		t.Fatalf("old owner replay was accepted: %v", err)
	}
	if err := taskDB.Model(&model.AppInstallNameClaim{}).Count(&claimCount).Error; err != nil { t.Fatal(err) }
	if claimCount != 1 { t.Fatal("replayed release removed the new owner") }
}

func TestNameReleaseBlocksUNKNOWNActiveOrMissingAppDB(t *testing.T) {
	for _, status := range []string{constant.StatusUnknown, constant.StatusExecuting, "Canceled"} {
		t.Run(status, func(t *testing.T) {
			taskDB, appDB := releaseTestDB(t)
			addNameOwner(t, taskDB, "jupyter", releaseTaskID, status, 0)
			err := releaseAppInstallNameAfterReview(context.Background(), taskDB, appDB,
				releaseTestRequest(), releaseObserver(), releaseApprover())
			if !errors.Is(err, ErrAppInstallNameReleaseDenied) { t.Fatalf("%s released: %v", status, err) }
			assertNoRelease(t, taskDB)
		})
	}
	t.Run("AppRowStillExists", func(t *testing.T) {
		taskDB, appDB := releaseTestDB(t)
		addNameOwner(t, taskDB, "jupyter", releaseTaskID, constant.StatusSuccess, 44)
		if err := appDB.Exec("INSERT INTO app_installs(id,name) VALUES (?,?)", 44, "JUPYTER").Error; err != nil { t.Fatal(err) }
		if err := releaseAppInstallNameAfterReview(context.Background(), taskDB, appDB,
			releaseTestRequest(), releaseObserver(), releaseApprover()); !errors.Is(err, ErrAppInstallNameReleaseDenied) {
			t.Fatalf("installed app row was ignored: %v", err)
		}
		assertNoRelease(t, taskDB)
	})
}

func TestNameReleaseRejectsStaleWrongOrIncompleteProof(t *testing.T) {
	for label, mutate := range map[string]func(*appInstallNameReleaseProbe){
		"Stale": func(p *appInstallNameReleaseProbe){p.ObservedAt = time.Now().Add(-time.Hour)},
		"WrongOwner": func(p *appInstallNameReleaseProbe){p.OwnerTaskID = releaseID2},
		"DockerPresent": func(p *appInstallNameReleaseProbe){p.DockerAbsent = false},
		"ComposePresent": func(p *appInstallNameReleaseProbe){p.ComposeAbsent = false},
		"FilesystemPresent": func(p *appInstallNameReleaseProbe){p.FilesystemAbsent = false},
		"OperationsRunning": func(p *appInstallNameReleaseProbe){p.NoActiveOperations = false},
		"FutureClock": func(p *appInstallNameReleaseProbe){p.ObservedAt = time.Now().Add(time.Minute)},
	} {
		t.Run(label, func(t *testing.T){
			taskDB, appDB := releaseTestDB(t)
			addNameOwner(t, taskDB, "jupyter", releaseTaskID, constant.StatusFailed, 0)
			observe := func(ctx context.Context, k, id string)(appInstallNameReleaseProbe,error){
				p, err := releaseObserver()(ctx,k,id); mutate(&p);return p,err
			}
			if err := releaseAppInstallNameAfterReview(context.Background(), taskDB, appDB,
				releaseTestRequest(), observe, releaseApprover()); !errors.Is(err,ErrAppInstallNameReleaseDenied){
				t.Fatalf("%s falsely released claim: %v",label,err)
			}
			assertNoRelease(t,taskDB)
		})
	}
}

func TestNameReleaseDeniesBadApprovalAndMidReviewTaskChange(t *testing.T) {
	taskDB, appDB := releaseTestDB(t)
	addNameOwner(t, taskDB, "jupyter", releaseTaskID, constant.StatusSuccess, 0)
	bad := func(_ context.Context, _ appInstallNameReleaseRequest, _ string)(string,error){
		return "admin\nforged",nil
	}
	if err := releaseAppInstallNameAfterReview(context.Background(), taskDB, appDB,
		releaseTestRequest(), releaseObserver(),bad); !errors.Is(err,ErrAppInstallNameReleaseDenied){
		t.Fatalf("invalid approval bypassed: %v",err)
	}
	assertNoRelease(t,taskDB)
	change := func(_ context.Context, _ appInstallNameReleaseRequest, _ string)(string,error){
		if err := taskDB.Model(&model.Task{}).Where("id = ?",releaseTaskID).
			Update("status",constant.StatusUnknown).Error; err != nil { return "",err }
		return "test-admin",nil
	}
	if err := releaseAppInstallNameAfterReview(context.Background(), taskDB, appDB,
		releaseTestRequest(), releaseObserver(),change); !errors.Is(err,ErrAppInstallNameReleaseDenied){
		t.Fatalf("UNKNOWN status transition bypassed review: %v",err)
	}
	assertNoRelease(t,taskDB)
}

func TestNameReleaseFailsIfPostApprovalResourceObservationChanges(t *testing.T) {
	taskDB, appDB := releaseTestDB(t)
	addNameOwner(t, taskDB, "jupyter", releaseTaskID, constant.StatusSuccess, 0)
	attempts := 0
	observer := func(ctx context.Context, key, owner string) (appInstallNameReleaseProbe, error) {
		attempts++
		p, err := releaseObserver()(ctx, key, owner)
		if attempts == 2 { p.DockerAbsent = false }
		return p, err
	}
	if err := releaseAppInstallNameAfterReview(context.Background(), taskDB, appDB,
		releaseTestRequest(), observer, releaseApprover()); !errors.Is(err, ErrAppInstallNameReleaseDenied) {
		t.Fatalf("changing Docker evidence did not block release: %v", err)
	}
	if attempts != 2 { t.Fatalf("release did not reobserve after approval: %d", attempts) }
	assertNoRelease(t, taskDB)
}

func TestNameReleaseWithoutTrustedObserverOrApproverFailsClosed(t *testing.T) {
	taskDB, appDB := releaseTestDB(t)
	addNameOwner(t, taskDB, "jupyter", releaseTaskID, constant.StatusSuccess, 0)
	for _, pair := range []struct {
		observe appInstallNameReleaseObserver
		approve appInstallNameReleaseApprover
	}{
		{nil, releaseApprover()},
		{releaseObserver(), nil},
	} {
		if err := releaseAppInstallNameAfterReview(context.Background(), taskDB, appDB,
			releaseTestRequest(), pair.observe, pair.approve); !errors.Is(err, ErrAppInstallNameReleaseDenied) {
			t.Fatalf("untrusted missing dependency released owner: %v", err)
		}
	}
	assertNoRelease(t, taskDB)
}

func TestNameReleaseAuditSchemaMissingFailsBeforeCAS(t *testing.T) {
	taskDB, appDB := releaseTestDB(t)
	addNameOwner(t, taskDB, "jupyter", releaseTaskID, constant.StatusSuccess, 0)
	if err := taskDB.Migrator().DropTable(&model.AppInstallNameReleaseAudit{}); err != nil { t.Fatal(err) }
	err := releaseAppInstallNameAfterReview(context.Background(), taskDB,appDB,
		releaseTestRequest(),releaseObserver(),releaseApprover())
	if err == nil || !strings.Contains(err.Error(),"audit") { t.Fatalf("missing audit schema admitted: %v",err) }
	var claimCount int64
	if err := taskDB.Model(&model.AppInstallNameClaim{}).Count(&claimCount).Error; err != nil { t.Fatal(err) }
	if claimCount != 1 { t.Fatal("missing audit table released owner") }
}

func TestNameReleaseConcurrentSameOwnerCASHasOneAudit(t *testing.T) {
	taskDB, appDB := releaseTestDB(t)
	addNameOwner(t, taskDB, "jupyter", releaseTaskID, constant.StatusFailed, 0)
	const workers = 8
	var wg sync.WaitGroup
	var mu sync.Mutex
	succeeded := 0
	for i:=0;i<workers;i++{
		wg.Add(1)
		go func(i int){
			defer wg.Done()
			req := releaseTestRequest()
			req.RequestID = fmt.Sprintf("%08x-1111-4111-8111-111111111111", i+1)
			err := releaseAppInstallNameAfterReview(context.Background(),taskDB,appDB,
				req,releaseObserver(),releaseApprover())
			if err==nil {mu.Lock();succeeded++;mu.Unlock()}
		}(i)
	}
	wg.Wait()
	if succeeded!=1 {t.Fatalf("concurrent releases succeeded=%d; expected one",succeeded)}
	var n int64
	if err := taskDB.Model(&model.AppInstallNameReleaseAudit{}).Count(&n).Error; err != nil {t.Fatal(err)}
	if n!=1 {t.Fatalf("failed release transactions left %d audit events",n)}
}
