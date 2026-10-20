package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"testing"
	"time"
)

func readWatchRecords(t *testing.T, bytes []byte) []watchRecord {
	t.Helper()
	scanner := bufio.NewScanner(strings.NewReader(string(bytes)))
	var records []watchRecord
	for scanner.Scan() {
		var r watchRecord
		if err := json.Unmarshal(scanner.Bytes(), &r); err != nil { t.Fatal(err) }
		records = append(records, r)
	}
	if err := scanner.Err(); err != nil { t.Fatal(err) }
	return records
}

func TestWatchDisconnectClearsStaleSessionsAndRecovers(t *testing.T) {
	// Exercises the actual bounded watch loop, not only JSON helper structs.
	// Every iteration must take a fresh observation; no former snapshot may
	// survive a disconnected native RPC.
	original := snapshot{
		Version: 2, Source: "local-user-codex-appserver",
		ReadOnly: true, Verified: false, Scope: "attached-loopback-appserver",
		Sessions: []session{{
			SessionID: "thread-a", Runtime: "codex", Project: "project",
			Started: "2026-10-20T10:00:00Z", Liveness: "unknown", Status: "active",
		}},
	}
	calls := 0
	fetch := func() (snapshot, error) {
		calls++
		switch calls {
		case 1: return original, nil
		case 2: return snapshot{}, errors.New("PRIVATE_NATIVE_ERROR_FROM_SERVER")
		case 3:
			next := original
			next.Sessions = []session{{
				SessionID: "thread-b", Runtime: "codex", Project: "other",
				Started: "2026-10-20T10:05:00Z", Liveness: "unknown", Status: "idle",
			}}
			return next, nil
		default: return snapshot{}, errors.New("unexpected call")
		}
	}
	var output bytes.Buffer
	if err := watch(context.Background(), &output, 3, minWatchInterval, fetch); err != nil {
		t.Fatal(err)
	}
	result := readWatchRecords(t, output.Bytes())
	if calls != 3 || len(result) != 3 { t.Fatalf("calls=%d records=%d", calls, len(result)) }
	if result[0].Connection != "observed" || result[0].Snapshot == nil ||
		result[0].Snapshot.Sessions[0].SessionID != "thread-a" {
		t.Fatal("initial observation unavailable")
	}
	if result[1].Connection != "unavailable" || result[1].Snapshot != nil {
		t.Fatalf("offline published stale state: %+v", result[1])
	}
	if result[2].Connection != "observed" || result[2].Snapshot == nil ||
		result[2].Snapshot.Sessions[0].SessionID != "thread-b" {
		t.Fatal("reconnect used stale or wrong native thread")
	}
	if strings.Contains(output.String(), "PRIVATE_NATIVE_ERROR") ||
		strings.Contains(output.String(), "thread-a\"") && strings.Contains(
			strings.Split(strings.TrimSpace(output.String()), "\n")[1], "thread-a") {
		t.Fatal("native error or prior thread leaked into unavailable event")
	}
	for idx, r := range result {
		if r.Sequence != idx+1 || r.LiveVerified || r.Source != "local-user-codex-watch" {
			t.Fatalf("unexpected status envelope: %+v", r)
		}
	}
}

func TestWatchRefusesInvalidBoundsAndCancelledWork(t *testing.T) {
	for _, tc := range []struct{samples int; interval time.Duration}{
		{0, minWatchInterval},
		{maxWatchSamples+1, minWatchInterval},
		{1, minWatchInterval-time.Second},
		{1, maxWatchInterval+time.Second},
	} {
		var output bytes.Buffer
		if err:=watch(context.Background(), &output, tc.samples, tc.interval,
			func()(snapshot,error){ return snapshot{},nil });err==nil {
			t.Errorf("accepted invalid bounds: %+v",tc)
		}
		if output.Len()!=0 { t.Fatal("wrote data on invalid request") }
	}
	ctx,cancel:=context.WithCancel(context.Background())
	cancel()
	called:=false
	if err:=watch(ctx, io.Discard,1,minWatchInterval,func()(snapshot,error){
		called=true;return snapshot{},nil
	});!errors.Is(err,context.Canceled) || called {
		t.Fatalf("cancelled watch executed native RPC, err=%v called=%v",err,called)
	}
}

func TestWatchRejectsInvalidSuccessAndOutputErrors(t *testing.T) {
	var output bytes.Buffer
	if err:=watch(context.Background(), &output,1,minWatchInterval,func()(snapshot,error){
		return snapshot{Source:"forged-remote-server",ReadOnly:true},nil
	});err!=nil {t.Fatal(err)}
	records:=readWatchRecords(t,output.Bytes())
	if len(records)!=1 || records[0].Connection!="unavailable" || records[0].Snapshot!=nil {
		t.Fatal("accepted forged runtime observation as valid")
	}
	expected:=errors.New("disk full")
	if err:=watch(context.Background(), &failureWriter{expected},1,minWatchInterval,
		func()(snapshot,error){return snapshot{},nil});!errors.Is(err,expected) {
		t.Fatalf("ignored writer failure: %v",err)
	}
}

type failureWriter struct { err error }
func (w *failureWriter) Write(_ []byte)(int,error) { return 0,fmt.Errorf("write: %w",w.err) }
