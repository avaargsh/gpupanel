package service

import (
	"errors"
	"os"
	"strings"
	"sync"
	"testing"
)

// This simulates the exact conditional-update contract of SettingRepo.
// It does not replace the real SQLite race/VM acceptance that G3 needs.
type upgradeStatusFixture struct {
	mu sync.Mutex
	value string
}

func (s *upgradeStatusFixture) cas(key, old, next string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if key != "SystemStatus" {
		return false, errors.New("wrong setting key")
	}
	if s.value != old {
		return false, nil
	}
	s.value = next
	return true, nil
}

func (s *upgradeStatusFixture) read() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.value
}

func TestG3UpgradeCASAllowsExactlyOneDifferentVersionRequest(t *testing.T) {
	s := &upgradeStatusFixture{value:"Free"}
	const workers = 48
	var wg sync.WaitGroup
	var mu sync.Mutex
	winners, denied := 0, 0
	for i:=0;i<workers;i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			err := claimUpgradeAdmission(s.cas)
			mu.Lock()
			defer mu.Unlock()
			if err == nil {winners++} else if errors.Is(err, errUpgradeAdmissionBusy) {denied++} else {
				t.Errorf("unexpected CAS result: %v",err)
			}
		}()
	}
	wg.Wait()
	if winners!=1 || denied!=workers-1 || s.read()!="Upgrading" {
		t.Fatalf("concurrent requests admitted=%d refused=%d status=%q", winners,denied,s.read())
	}
	if err:=claimUpgradeAdmission(s.cas);!errors.Is(err,errUpgradeAdmissionBusy) {
		t.Fatalf("unreconciled upgrade admitted: %v",err)
	}
	if err:=releaseUpgradeAdmission(s.cas);err!=nil {t.Fatal(err)}
	if s.read()!="Free" {t.Fatal("pre-mutation cleanup did not release admission")}
}

func TestG3UpgradeCASRefusesMissingOrUntrustedStatus(t *testing.T) {
	for _, status:=range []string{"", "Upgrading", "Failed", "Restarting"} {
		s:=&upgradeStatusFixture{value:status}
		if err:=claimUpgradeAdmission(s.cas);!errors.Is(err,errUpgradeAdmissionBusy) {
			t.Fatalf("unexpected status %q was admitted: %v",status,err)
		}
		if s.read()!=status {t.Fatal("denied admission modified persisted status")}
	}
	if err:=claimUpgradeAdmission(nil);!errors.Is(err,errUpgradeAdmissionBusy) {
		t.Fatalf("missing setting DB accepted: %v",err)
	}
	down:=func(_,_,_ string)(bool,error){return false,errors.New("database unavailable")}
	if err:=claimUpgradeAdmission(down);!errors.Is(err,errUpgradeAdmissionBusy) {
		t.Fatalf("database failure became authorization: %v",err)
	}
}

func TestG3UpgradeCASReleaseRequiresOwningState(t *testing.T) {
	s:=&upgradeStatusFixture{value:"Free"}
	if err:=releaseUpgradeAdmission(s.cas);err==nil {
		t.Fatal("release of nonexistent admission was accepted")
	}
	s.value="Unknown"
	if err:=releaseUpgradeAdmission(s.cas);err==nil {
		t.Fatal("operator-modified hold overwritten")
	}
	if s.read()!="Unknown" {t.Fatal("release overwrote foreign state")}
	down:=func(_,_,_ string)(bool,error){return false,errors.New("DB write failed")}
	if err:=releaseUpgradeAdmission(down);err==nil {t.Fatal("failed release appeared successful")}
}

func TestG3UpgradeDoesNotBlindlyReleaseStatusDuringUnverifiedRestart(t *testing.T) {
	source,err:=os.ReadFile("upgrade.go")
	if err!=nil {t.Fatal(err)}
	body:=string(source)
	if strings.Contains(body,`settingRepo.Update("SystemStatus", "Upgrading")`) ||
		strings.Contains(body,`settingRepo.Update("SystemStatus", "Free")`) {
		t.Fatal("upgrade overwrites durable status instead of CAS")
	}
	for _, token:=range []string{
		"claimUpgradeAdmission(settingRepo.UpdateIfMatch)",
		"releaseUpgradeAdmission(settingRepo.UpdateIfMatch)",
		"rollbackAndReconcile(",
		"SystemStatus=Upgrading",
	} {
		if !strings.Contains(body,token) {t.Fatalf("missing upgrade admission guard: %s",token)}
	}
}
