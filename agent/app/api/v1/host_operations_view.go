package v1

import (
	"github.com/avaargsh/GPUPanel/agent/app/hostops"
	"time"
)

// The response deliberately does not expose storage ownership, session or key.
type hostOperationView struct {
	ID         string     `json:"id"`
	Kind       string     `json:"kind"`
	Target     string     `json:"target"`
	Host       string     `json:"host"`
	Impact     string     `json:"impact"`
	Expected   string     `json:"expected"`
	Hash       string     `json:"hash"`
	State      string     `json:"state"`
	Output     string     `json:"output"`
	Error      string     `json:"error"`
	Verified   bool       `json:"verified"`
	CreatedAt  time.Time  `json:"createdAt"`
	ExpiresAt  time.Time  `json:"expiresAt"`
	FinishedAt *time.Time `json:"finishedAt"`
}

func operationView(r hostops.Receipt) hostOperationView {
	return hostOperationView{ID: r.ID, Kind: r.Kind, Target: r.Target, Host: r.Host, Impact: r.Impact, Expected: r.Expected, Hash: r.Hash, State: r.State, Output: r.Output, Error: r.Error, Verified: r.Verified, CreatedAt: r.CreatedAt, ExpiresAt: r.ExpiresAt, FinishedAt: r.FinishedAt}
}
