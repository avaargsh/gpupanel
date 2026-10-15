package service

import (
    "strings"
    "sync"
)

// Installation preparation must be serialized per application instance name,
// not per HTTP task ID. Multiple different Task IDs may otherwise both pass
// the inherited read-before-create name check and create duplicate records.
//
// This lock is process-local. The existing persisted TaskDB claim fences
// repeated *task IDs* across restart; true cross-process/name fencing and
// crash reconciliation require a separate durable contract before G5 is done.
type appInstallPreparationLock struct {
    mu sync.Mutex
    users int
}

var appInstallPreparationLocks = struct {
    sync.Mutex
    byName map[string]*appInstallPreparationLock
}{byName: make(map[string]*appInstallPreparationLock)}

func lockAppInstallPreparation(name string) func() {
    key := strings.ToLower(strings.TrimSpace(name))

    appInstallPreparationLocks.Lock()
    lock := appInstallPreparationLocks.byName[key]
    if lock == nil {
        lock = &appInstallPreparationLock{}
        appInstallPreparationLocks.byName[key] = lock
    }
    lock.users++
    appInstallPreparationLocks.Unlock()

    lock.mu.Lock()
    return func() {
        // Unlock first, then reclaim only if nobody is holding or waiting.
        // The ref count includes waiters, so a new caller cannot acquire an
        // unrelated lock for the same name while the old one is still live.
        lock.mu.Unlock()
        appInstallPreparationLocks.Lock()
        lock.users--
        if lock.users == 0 {
            delete(appInstallPreparationLocks.byName, key)
        }
        appInstallPreparationLocks.Unlock()
    }
}
