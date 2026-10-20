package model

import "time"

// AppInstallNameReleaseAudit is the durable, append-only owner transition
// evidence. It is written in the SAME TaskDB transaction as name claim removal.
// Request IDs are unique so lost ACK/replays cannot create a second release.
type AppInstallNameReleaseAudit struct {
	RequestID     string    `gorm:"primaryKey;size:36;not null" json:"-"`
	NameKey       string    `gorm:"index;size:255;not null" json:"-"`
	OwnerTaskID   string    `gorm:"not null;size:36" json:"-"`
	OperatorID    string    `gorm:"not null;size:128" json:"-"`
	EvidenceSHA256 string   `gorm:"not null;size:64" json:"-"`
	CreatedAt     time.Time `json:"-"`
}
