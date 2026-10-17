package hostops

import (
    "context"
    "fmt"
    "net/http"
    "net/http/httptest"
    "strings"
    "sync/atomic"
    "testing"
    "time"

    "github.com/docker/docker/client"
)

// A fake Docker HTTP daemon exercises inspect -> mutation -> independent
// inspect. It is not an actual Docker installation or a deployment claim.
func TestLocalStartStopObservationMatrix(t *testing.T) {
    for _, kind := range []string{Start, Stop} {
        for _, scenario := range []string{"verified", "drift", "auto-remove", "mutation-error", "observe-error", "unchanged"} {
            t.Run(kind+"/"+scenario, func(t *testing.T) {
                id := strings.Repeat("a", 64)
                var inspections, mutations atomic.Int32
                mutated, drift := false, false
                initialStatus := "exited"
                initialRunning := false
                if kind == Stop {
                    initialStatus, initialRunning = "running", true
                }
                server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
                    w.Header().Set("Content-Type", "application/json")
                    if strings.HasSuffix(r.URL.Path, "/start") || strings.HasSuffix(r.URL.Path, "/stop") {
                        mutations.Add(1)
                        if scenario == "mutation-error" {
                            w.WriteHeader(http.StatusInternalServerError)
                            fmt.Fprint(w, `{"message":"ACK unavailable"}`)
                            return
                        }
                        mutated = true
                        w.WriteHeader(http.StatusNoContent)
                        return
                    }
                    if !strings.HasSuffix(r.URL.Path, "/json") {
                        w.WriteHeader(http.StatusNotFound)
                        return
                    }
                    n := inspections.Add(1)
                    if scenario == "observe-error" && mutated && n > 1 {
                        w.WriteHeader(http.StatusInternalServerError)
                        fmt.Fprint(w, `{"message":"inspect unavailable"}`)
                        return
                    }
                    status, running, startedAt, finishedAt := initialStatus, initialRunning, "before-start", "before-finish"
                    if scenario == "drift" && drift { startedAt = "foreign-transition" }
                    if mutated && scenario != "unchanged" {
                        if kind == Start { status, running, startedAt = "running", true, "after-start" } else { status, running, finishedAt = "exited", false, "after-finish" }
                    }
                    fmt.Fprintf(w, `{"Id":%q,"Name":"/isolated-test","State":{"Status":%q,"Running":%t,"StartedAt":%q,"FinishedAt":%q,"Pid":%d},"HostConfig":{"AutoRemove":%t}}`,
                        id, status, running, startedAt, finishedAt, 42, scenario == "auto-remove")
                }))
                defer server.Close()
                runner := LocalRunner{dockerClient: func() (*client.Client, error) {
                    return client.NewClientWithOpts(client.WithHost(server.URL), client.WithVersion("1.47"))
                }}
                ctx, cancel := context.WithTimeout(context.Background(), 450*time.Millisecond)
                defer cancel()
                expected, _, err := runner.Prepare(ctx, kind, id)
                if scenario == "auto-remove" {
                    if err == nil || mutations.Load() != 0 { t.Fatal("auto-remove should be rejected at preview") }
                    return
                }
                if err != nil || expected == "" { t.Fatalf("preview: %v", err) }
                drift = true
                result, runErr := runner.Execute(ctx, Receipt{Kind: kind, Target: id, Expected: expected})
                switch scenario {
                case "drift":
                    if runErr == nil || mutations.Load() != 0 || result.Verified { t.Fatal("stale preview mutated Docker") }
                case "verified":
                    if runErr != nil || !result.Verified || result.Unknown || mutations.Load() != 1 || inspections.Load() < 3 {
                        t.Fatalf("did not independently verify: %+v %v (%d mutations %d inspections)",result,runErr,mutations.Load(),inspections.Load())
                    }
                default:
                    if runErr == nil || !result.Unknown || result.Verified || mutations.Load() != 1 {
                        t.Fatalf("uncertain mutation incorrectly reported: %+v %v, calls %d",result,runErr,mutations.Load())
                    }
                }
            })
        }
    }
}

func TestLocalStartStopInvalidPreviewAndIdentity(t *testing.T) {
    id := strings.Repeat("b",64)
    for _, kind := range []string{Start, Stop} {
        for _, status := range []string{"paused", "restarting", "dead"} {
            t.Run(kind+"/"+status,func(t *testing.T) {
                var called atomic.Int32
                server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
                    called.Add(1)
                    fmt.Fprintf(w,`{"Id":%q,"State":{"Status":%q,"Running":false,"Paused":%t,"Restarting":%t},"HostConfig":{"AutoRemove":false}}`,id,status,status=="paused",status=="restarting")
                }))
                defer server.Close()
                runner := LocalRunner{dockerClient: func() (*client.Client,error){
                    return client.NewClientWithOpts(client.WithHost(server.URL),client.WithVersion("1.47"))
                }}
                _,_,err := runner.Prepare(context.Background(),kind,id)
                if err == nil || called.Load() != 1 { t.Fatalf("invalid preview accepted: %s %s",kind,status) }
            })
        }
    }
}
