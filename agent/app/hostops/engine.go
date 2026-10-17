package hostops

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

var ErrDenied = errors.New("operation unavailable, expired, or confirmation does not match")
var validKey = regexp.MustCompile(`^[a-zA-Z0-9_-]{8,64}$`)
var fullContainerID = regexp.MustCompile(`^[a-f0-9]{64}$`)

// Engine uses one SQL claim for one global running slot, including other processes.
// No automatic replay, queue, background goroutine or arbitrary command payload.
type Engine struct {
	DB     *gorm.DB
	Runner Runner
}

func planHash(r Receipt) string {
	// Canonical fixed-field JSON binds all execution semantics, owner and validity.
	data, _ := json.Marshal([]string{"hostops/v1", r.ID, r.Owner, r.Kind, r.Target, r.Host, r.Expected, r.Impact, r.ExpiresAt.UTC().Format(time.RFC3339Nano), "timeout=20s"})
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func (e Engine) Plan(ctx context.Context, owner string, req PlanRequest) (Receipt, error) {
	if owner == "" || !validKey.MatchString(req.Key) {
		return Receipt{}, ErrDenied
	}
	if (req.Kind != Diagnose && req.Kind != Restart && req.Kind != Start && req.Kind != Stop) || (req.Kind == Diagnose && req.Target != "local") || (req.Kind != Diagnose && !fullContainerID.MatchString(req.Target)) {
		return Receipt{}, ErrDenied
	}
	var existing Receipt
	err := e.DB.Where("owner = ? AND key = ?", owner, req.Key).First(&existing).Error
	if err == nil {
		if existing.Kind != req.Kind || existing.Target != req.Target {
			return Receipt{}, ErrDenied
		}
		return existing, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return Receipt{}, err
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	expected, impact, err := e.Runner.Prepare(ctx, req.Kind, req.Target)
	if err != nil {
		return Receipt{}, err
	}
	now := time.Now().UTC()
	r := Receipt{ID: uuid.NewString(), Owner: owner, Key: req.Key, Kind: req.Kind, Target: req.Target, Host: "local", Impact: impact, Expected: expected, State: "planned", CreatedAt: now, ExpiresAt: now.Add(5 * time.Minute)}
	r.Hash = planHash(r)
	if err := e.DB.Transaction(func(tx *gorm.DB) error {
		var count int64
		if err := tx.Model(&Receipt{}).Count(&count).Error; err != nil {
			return err
		}
		if count >= 500 {
			return errors.New("operation receipt capacity reached; export and review retention before creating more")
		}
		return tx.Create(&r).Error
	}); err != nil {
		if e.DB.Where("owner = ? AND key = ?", owner, req.Key).First(&existing).Error == nil && existing.Kind == req.Kind && existing.Target == req.Target {
			return existing, nil
		}
		return Receipt{}, err
	}
	return r, nil
}

func (e Engine) expireRunning() error {
	// A lost response/crash cannot turn an uncertain mutation into a failed/safe retry.
	return e.DB.Model(&Receipt{}).Where("state = ? AND deadline < ?", "running", time.Now().UTC()).Updates(map[string]interface{}{"state": "unknown", "error": "execution deadline passed; query the target before planning a new action"}).Error
}
func (e Engine) Get(owner, id string) (Receipt, error) {
	if owner == "" {
		return Receipt{}, ErrDenied
	}
	if err := e.expireRunning(); err != nil {
		return Receipt{}, err
	}
	var r Receipt
	if err := e.DB.Where("owner = ? AND id = ?", owner, id).First(&r).Error; err != nil {
		return Receipt{}, ErrDenied
	}
	return r, nil
}
func (e Engine) List(owner string) ([]Receipt, error) {
	if owner == "" {
		return nil, ErrDenied
	}
	if err := e.expireRunning(); err != nil {
		return nil, err
	}
	rows := []Receipt{}
	err := e.DB.Where("owner = ?", owner).Order("created_at DESC").Limit(50).Find(&rows).Error
	return rows, err
}

func (e Engine) Execute(ctx context.Context, owner, id string, confirm ConfirmRequest) (Receipt, error) {
	r, err := e.Get(owner, id)
	if err != nil || !confirm.Confirm || confirm.Hash != r.Hash || planHash(r) != r.Hash {
		return Receipt{}, ErrDenied
	}
	// A repeated confirmation queries its receipt; it cannot re-run the operation.
	if r.State != "planned" {
		return r, nil
	}
	if time.Now().After(r.ExpiresAt) {
		return Receipt{}, ErrDenied
	}
	deadline := time.Now().UTC().Add(25 * time.Second)
	claim := e.DB.Model(&Receipt{}).Where("id = ? AND owner = ? AND state = ? AND expires_at > ? AND NOT EXISTS (SELECT 1 FROM host_operation_receipts WHERE state = ?)", id, owner, "planned", time.Now().UTC(), "running").Updates(map[string]interface{}{"state": "running", "deadline": deadline})
	if claim.Error != nil {
		return Receipt{}, claim.Error
	}
	if claim.RowsAffected != 1 {
		return Receipt{}, errors.New("operation slot busy; query receipt before confirming again")
	}
	r.State = "running"
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	result, runErr := e.Runner.Execute(ctx, r)
	state := "completed"
	if runErr != nil {
		state = "failed"
	}
	if result.Unknown || ctx.Err() != nil {
		state = "unknown"
	}
	if result.Verified && runErr == nil && state == "completed" {
		state = "verified"
	}
	if len(result.Output) > 16384 {
		result.Output = result.Output[:16384] + "\n[truncated]"
	}
	message := ""
	if runErr != nil {
		message = runErr.Error()
		if len(message) > 512 {
			message = message[:512]
		}
	}
	now := time.Now().UTC()
	// Deliberately persist after HTTP cancellation; inability to record stays UNKNOWN.
	saved := e.DB.Model(&Receipt{}).Where("id = ? AND state = ?", id, "running").Updates(map[string]interface{}{"state": state, "output": result.Output, "verified": state == "verified", "error": message, "finished_at": now})
	if saved.Error != nil || saved.RowsAffected != 1 {
		return Receipt{}, fmt.Errorf("execution result not recorded; query operation %s", id)
	}
	return e.Get(owner, id)
}
