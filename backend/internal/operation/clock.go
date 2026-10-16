// SPDX-License-Identifier: Apache-2.0

package operation

import "time"

// Clock supplies the current time. Production callers may leave Config.Clock
// nil to use the system clock; tests inject a deterministic implementation so
// expiry, timeout and reconciliation are reproducible without sleeping.
type Clock interface {
	Now() time.Time
}

// systemClock is the default Clock.
type systemClock struct{}

func (systemClock) Now() time.Time { return time.Now() }
