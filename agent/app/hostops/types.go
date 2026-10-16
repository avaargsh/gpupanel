// Package hostops owns bounded local operation plans and durable receipts.
// Design reference: agentaliyun assist controlplane; independently implemented.
package hostops

import (
	"context"
	"time"
)

const Diagnose = "host.diagnose"
const Restart = "container.restart"

// Receipt is additive storage in task.db, not an existing Task schema change.
// Owner includes the authenticated session hash and is never returned to clients.
type Receipt struct {
	ID         string     `gorm:"primaryKey" json:"id"`
	Owner      string     `gorm:"uniqueIndex:hostops_owner_key" json:"-"`
	Key        string     `gorm:"uniqueIndex:hostops_owner_key" json:"-"`
	Kind       string     `json:"kind"`
	Target     string     `json:"target"`
	Host       string     `json:"host"`
	Impact     string     `json:"impact"`
	Expected   string     `json:"expected"`
	Hash       string     `json:"hash"`
	State      string     `gorm:"index" json:"state"`
	Output     string     `json:"output"`
	Error      string     `json:"error"`
	Verified   bool       `json:"verified"`
	CreatedAt  time.Time  `json:"createdAt"`
	ExpiresAt  time.Time  `json:"expiresAt"`
	Deadline   time.Time  `json:"deadline"`
	FinishedAt *time.Time `json:"finishedAt"`
}

func (Receipt) TableName() string { return "host_operation_receipts" }

type PlanRequest struct {
	Kind   string `json:"kind"`
	Target string `json:"target"`
	Key    string `json:"key"`
}
type ConfirmRequest struct {
	Hash    string `json:"hash"`
	Confirm bool   `json:"confirm"`
}

type Result struct {
	Output   string
	Verified bool
	// Unknown means a mutation may have happened; replay is forbidden.
	Unknown bool
}

type Runner interface {
	Prepare(context.Context, string, string) (expected, impact string, err error)
	Execute(context.Context, Receipt) (Result, error)
}
