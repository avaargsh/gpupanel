package dto

import "time"

// LifecycleOperationInfo is a redacted owner-scoped receipt. It intentionally
// excludes the trusted owner and caller idempotency key.
type LifecycleOperationInfo struct {
	OperationID   string    `json:"operationId"`
	Kind          string    `json:"kind"`
	State         string    `json:"state"`
	Revision      uint64    `json:"revision"`
	Stage         string    `json:"stage"`
	ErrorCode     string    `json:"errorCode,omitempty"`
	ArtifactSHA256 string   `json:"artifactSha256,omitempty"`
	EvidenceSHA256 string   `json:"evidenceSha256,omitempty"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
	Replayed      bool      `json:"replayed"`
}
