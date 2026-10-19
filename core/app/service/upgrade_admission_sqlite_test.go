package service

import (
	"errors"
	"fmt"
	"path/filepath"
	"sync"
	"testing"

	"github.com/avaargsh/GPUPanel/core/app/model"
	"github.com/avaargsh/GPUPanel/core/app/repo"
	"github.com/avaargsh/GPUPanel/core/global"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// This is a real SQLite/SettingRepo CAS test, not an in-memory mutex fake.
// No production database is opened. An unavailable or busy database must
// never admit an extra in-app upgrade.
func TestG3UpgradeAdmissionAcrossSQLiteConnections(t *testing.T) {
	old := global.DB
	t.Cleanup(func(){ global.DB = old })
	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)", filepath.Join(t.TempDir(), "g3-admission.db"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil { t.Fatal(err) }
	sqlDB, err := db.DB()
	if err != nil { t.Fatal(err) }
	defer sqlDB.Close()
	sqlDB.SetMaxOpenConns(6)
	if err := db.AutoMigrate(&model.Setting{}); err != nil {t.Fatal(err)}
	if err := db.Create(&model.Setting{Key:"SystemStatus",Value:"Free"}).Error; err != nil {t.Fatal(err)}
	global.DB = db
	settings := repo.NewISettingRepo()

	const count=24
	var wg sync.WaitGroup
	var mu sync.Mutex
	successes, refusals, databaseErrors:=0,0,0
	for i:=0;i<count;i++{
		wg.Add(1)
		go func(){
			defer wg.Done()
			err := claimUpgradeAdmission(settings.UpdateIfMatch)
			mu.Lock()
			defer mu.Unlock()
			switch {
			case err==nil:successes++
			case errors.Is(err,errUpgradeAdmissionBusy):refusals++
			default: databaseErrors++
			}
		}()
	}
	wg.Wait()
	if successes!=1 || refusals!=count-1 || databaseErrors!=0{
		t.Fatalf("SQLite CAS admitted=%d denied=%d unexpected=%d",successes,refusals,databaseErrors)
	}
	var current model.Setting
	if err := db.Where("key = ?", "SystemStatus").First(&current).Error; err != nil {t.Fatal(err)}
	if current.Value!="Upgrading"{t.Fatalf("CAS failed to persist owner hold: %q",current.Value)}
	if err := releaseUpgradeAdmission(settings.UpdateIfMatch);err!=nil {t.Fatal(err)}
	if err := db.Where("key = ?", "SystemStatus").First(&current).Error;err!=nil {t.Fatal(err)}
	if current.Value!="Free"{t.Fatalf("CAS release did not persist Free: %q",current.Value)}
}
