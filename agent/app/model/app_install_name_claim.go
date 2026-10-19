package model

import "time"

// AppInstallNameClaim is a durable, append-only admission owner in TaskDB.
//
// Names are normalized before insertion; uniqueness fences concurrent requests
// with different Task IDs even across Agent processes/restarts. No asynchronous
// worker may delete or automatically expire a claim. Manual reconciliation is
// required before name reuse; this intentionally favors safety over availability.
type AppInstallNameClaim struct {
    NameKey   string    `gorm:"primaryKey;size:255;not null" json:"-"`
    TaskID    string    `gorm:"not null;size:36" json:"-"`
    CreatedAt time.Time `json:"-"`
}
