package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"time"

	"github.com/gorilla/websocket"
)

const maxEventRecords = 120

type nativeNotification struct {
	Method string          `json:"method"`
	Params json.RawMessage `json:"params"`
	ID     json.RawMessage `json:"id"`
}
type statusChange struct {
	ThreadID string `json:"threadId"`
	Status struct {
		Type string `json:"type"`
	} `json:"status"`
}

type observerConnector func() (*websocket.Conn, snapshot, error)

// applyNativeEvent projects ONLY native status for already-authorized IDs in
// the DB-only first page. No prompt, command, delta or approval is retained.
// Structural changes force a new DB snapshot; do not guess added/deleted IDs.
func applyNativeEvent(snap snapshot, wire []byte) (snapshot, bool, bool, error) {
	var frame nativeNotification
	if err := json.Unmarshal(wire, &frame); err != nil {
		return snapshot{}, false, false, errors.New("invalid native notification")
	}
	if len(frame.ID) != 0 {
		// Unsolicited server RPC requests are never answered by this observer.
		return snap, false, false, nil
	}
	switch frame.Method {
	case "thread/started", "thread/deleted", "thread/archived",
		"thread/unarchived", "thread/closed":
		return snap, false, true, nil
	case "thread/status/changed":
		var change statusChange
		if err := json.Unmarshal(frame.Params, &change); err != nil ||
			!nativeID.MatchString(change.ThreadID) {
			return snapshot{}, false, false, errors.New("invalid native status notification")
		}
		for idx, entry := range snap.Sessions {
			if entry.SessionID != change.ThreadID { continue }
			switch change.Status.Type {
			case "notLoaded", "idle", "active", "systemError":
			default:
				return snapshot{}, false, false, errors.New("unsupported native status notification")
			}
			if entry.Status == change.Status.Type { return snap, false, false, nil }
			next := snap
			next.Sessions = append([]session(nil), snap.Sessions...)
			next.Sessions[idx].Status = change.Status.Type
			return next, true, false, nil
		}
		// A native event for a different thread is not a grant to discover it.
		return snap, false, false, nil
	case "error":
		return snapshot{}, false, false, errors.New("native server signaled an error")
	default:
		return snap, false, false, nil
	}
}

// consumeNative reads notifications from the SAME app-server connection used
// for initial DB-only thread/list. It never sends a mutating RPC. Silence for
// 15 seconds forces disconnect/requery rather than letting statuses grow stale.
func consumeNative(ctx context.Context, conn *websocket.Conn, snap snapshot,
	deadline time.Time, emit func(snapshot, bool) error) error {
	for frames := 0; frames < 1000; frames++ {
		if err := ctx.Err(); err != nil { return err }
		readUntil := time.Now().Add(15 * time.Second)
		if deadline.Before(readUntil) { readUntil = deadline }
		if err := conn.SetReadDeadline(readUntil); err != nil { return err }
		_, wire, err := conn.ReadMessage()
		if err != nil { return errors.New("native stream disconnected or idle") }
		next, changed, resync, err := applyNativeEvent(snap, wire)
		if err != nil { return err }
		if resync { return errors.New("native thread set changed, resync required") }
		if !changed { continue }
		snap = next
		if err := emit(snap, true); err != nil { return err }
	}
	return errors.New("native notification flood exceeds budget")
}

func eventStream(ctx context.Context, output io.Writer, raw string, seconds, attempts int) error {
	return eventStreamAuthenticated(ctx, output, raw, seconds, attempts, "")
}

func eventStreamAuthenticated(ctx context.Context, output io.Writer, raw string, seconds, attempts int, token string) error {
	if _, err := endpoint(raw); err != nil { return err }
	if seconds < 15 || seconds > 90 { return errors.New("invalid event observation duration") }
	return streamNativeEvents(ctx, output, time.Duration(seconds)*time.Second, attempts,
		func() (*websocket.Conn, snapshot, error) { return openAuthenticatedObserverSocket(raw, token) })
}

// streamNativeEvents emits an NDJSON watch-compatible envelope. Even a clean
// end emits unavailable, preventing the UI from treating stale status as live.
func streamNativeEvents(ctx context.Context, output io.Writer, duration time.Duration,
	attempts int, connect observerConnector) error {
	if duration < 15*time.Second || duration > 90*time.Second ||
		attempts < 1 || attempts > 5 || connect == nil {
		return errors.New("invalid native event observation bounds")
	}
	encoder := json.NewEncoder(output)
	deadline := time.Now().Add(duration)
	seq := 0
	emit := func(snap snapshot, observed bool) error {
		if seq >= maxEventRecords { return errors.New("native status event cap exceeded") }
		seq++
		var problem error
		if !observed { problem = errors.New("unavailable") }
		rec := makeWatchRecord(seq, time.Now(), snap, problem)
		if err := encoder.Encode(rec); err != nil { return err }
		return nil
	}
	for attempt := 1; attempt <= attempts && time.Now().Before(deadline); attempt++ {
		if err := ctx.Err(); err != nil { return err }
		conn, snap, err := connect()
		if err == nil {
			if err := emit(snap, true); err != nil { _ = conn.Close(); return err }
			err = consumeNative(ctx, conn, snap, deadline, emit)
			_ = conn.Close()
			if ctx.Err() != nil { return ctx.Err() }
		}
		if err := emit(snapshot{}, false); err != nil { return err }
		if seq >= maxEventRecords { return errors.New("native status event cap reached") }
		if time.Now().After(deadline) { return nil }
		if attempt < attempts {
			wait := time.NewTimer(time.Second)
			select {
			case <-ctx.Done(): wait.Stop(); return ctx.Err()
			case <-wait.C:
			}
		}
	}
	if ctx.Err() != nil { return ctx.Err() }
	if time.Now().Before(deadline) { return errors.New("native reconnection budget exhausted") }
	return nil
}
