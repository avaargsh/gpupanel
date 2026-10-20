package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"time"
)

const nativeUnixObserverScope = "attached-owner-verified-unix-appserver"

const (
	minWatchInterval = 3 * time.Second
	maxWatchInterval = 60 * time.Second
	maxWatchSamples  = 120
)

// Watch record is one bounded, time-stamped, sanitized observation. It is not
// an authority-bearing native thread event and cannot prove global liveness.
// Connection=unavailable MUST NOT include stale sessions from a prior success.
type watchRecord struct {
	SchemaVersion int       `json:"schemaVersion"`
	Source        string    `json:"source"`
	Sequence      int       `json:"sequence"`
	ObservedAt    string    `json:"observedAt"`
	Connection    string    `json:"connection"`
	LiveVerified  bool      `json:"liveStatusVerified"`
	Snapshot      *snapshot `json:"snapshot"`
}

type sampleFn func() (snapshot, error)

func makeWatchRecord(sequence int, now time.Time, snap snapshot, err error) watchRecord {
	record := watchRecord{
		SchemaVersion: 1, Source: "local-user-codex-watch",
		Sequence: sequence, ObservedAt: now.UTC().Format(time.RFC3339Nano),
		Connection: "unavailable", LiveVerified: false,
	}
	// Explicit reconnection has to independently re-query the native server.
	// A successful JSON-RPC reply is not proof of global session liveness.
	if err == nil && snap.Source == "local-user-codex-appserver" &&
		(snap.Scope == "attached-loopback-appserver" ||
		 snap.Scope == nativeUnixObserverScope) &&
		snap.ReadOnly && !snap.Verified && len(snap.Sessions) <= maxRows {
		record.Connection = "observed"
		record.Snapshot = &snap
	}
	return record
}

// watch sends a finite NDJSON stream to the CALLER'S own stdout. Each sample
// opens a NEW read-only WebSocket and closes it after a bounded RPC request.
// It deliberately does not hold a native event subscription or background
// process, and it never retries a potentially mutating operation.
func watch(ctx context.Context, output io.Writer, samples int, interval time.Duration, fetch sampleFn) error {
	if samples < 1 || samples > maxWatchSamples ||
		interval < minWatchInterval || interval > maxWatchInterval || fetch == nil {
		return errors.New("invalid bounded observation configuration")
	}
	encoder := json.NewEncoder(output)
	for sequence := 1; sequence <= samples; sequence++ {
		if err := ctx.Err(); err != nil { return err }
		snap, readErr := fetch()
		record := makeWatchRecord(sequence, time.Now(), snap, readErr)
		if err := encoder.Encode(record); err != nil {
			return fmt.Errorf("unable to deliver observation: %w", err)
		}
		if sequence == samples { break }
		wait := time.NewTimer(interval)
		select {
		case <-ctx.Done():
			if !wait.Stop() {
				select { case <-wait.C: default: }
			}
			return ctx.Err()
		case <-wait.C:
		}
	}
	return nil
}
