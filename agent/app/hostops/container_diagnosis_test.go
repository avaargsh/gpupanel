package hostops

import (
    "context"
    "encoding/json"
    "fmt"
    "net/http"
    "net/http/httptest"
    "strings"
    "sync/atomic"
    "testing"

    "github.com/docker/docker/client"
)

func TestContainerDiagnosisReadOnlyAllowlist(t *testing.T) {
    id := strings.Repeat("a", 64)
    var inspections, writes atomic.Int32
    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodGet || !strings.HasSuffix(r.URL.Path, "/json") {
            writes.Add(1)
            w.WriteHeader(http.StatusForbidden)
            return
        }
        inspections.Add(1)
        w.Header().Set("Content-Type", "application/json")
        fmt.Fprintf(w, `{"Id":%q,"Name":"/SECRET_CONTAINER","Path":"SECRET_BINARY",
            "Args":["SECRET_ARGS"],"Config":{"Env":["API_KEY=SECRET_ENV"]},
            "Mounts":[{"Source":"/SECRET_MOUNT"}],
            "State":{"Status":"exited","Running":false,"ExitCode":137,"OOMKilled":true,
            "Health":{"Status":"unhealthy","Log":[{"Output":"SECRET_HEALTH_LOG"}]}}}`, id)
    }))
    defer server.Close()
    runner := LocalRunner{dockerClient: func() (*client.Client, error) {
        return client.NewClientWithOpts(client.WithHost(server.URL), client.WithVersion("1.47"))
    }}
    expected, impact, err := runner.Prepare(context.Background(), ContainerDiagnose, id)
    if err != nil || expected != "read-only" || !strings.Contains(impact, id) {
        t.Fatalf("invalid observation plan: %s %s %v", expected, impact, err)
    }
    result, err := runner.Execute(context.Background(), Receipt{Kind: ContainerDiagnose, Target: id, Expected: expected})
    if err != nil || result.Verified || result.Unknown || writes.Load() != 0 || inspections.Load() != 2 {
        t.Fatalf("read-only observation must never mutate: %+v %v (reads=%d writes=%d)", result, err, inspections.Load(), writes.Load())
    }
    var view containerDiagnosis
    if err := json.Unmarshal([]byte(result.Output), &view); err != nil {
        t.Fatal(err)
    }
    if view.ContainerID != id || view.Status != "exited" || view.Running ||
        view.ExitCode != 137 || !view.OOMKilled || view.Health != "unhealthy" ||
        view.Observation != "read-only-docker-inspect" {
        t.Fatalf("incorrect bounded observation: %+v", view)
    }
    for _, token := range []string{"SECRET_CONTAINER", "SECRET_BINARY", "SECRET_ARGS", "SECRET_ENV", "SECRET_MOUNT", "SECRET_HEALTH_LOG"} {
        if strings.Contains(result.Output, token) {
            t.Fatalf("sensitive Docker Inspect field reflected: %s", token)
        }
    }
}

func TestContainerDiagnosisRejectsUnknownStateIdentityAndDaemonErrors(t *testing.T) {
    id := strings.Repeat("b", 64)
    for _, scenario := range []string{"unknown-state", "wrong-id", "daemon-error", "missing-state"} {
        t.Run(scenario, func(t *testing.T) {
            var writes atomic.Int32
            server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
                if r.Method != http.MethodGet {
                    writes.Add(1)
                    w.WriteHeader(http.StatusForbidden)
                    return
                }
                w.Header().Set("Content-Type", "application/json")
                if scenario == "daemon-error" {
                    w.WriteHeader(http.StatusInternalServerError)
                    fmt.Fprint(w, `{"message":"SUPERSECRET_DAEMON"}`)
                    return
                }
                observed := id
                if scenario == "wrong-id" {
                    observed = strings.Repeat("c", 64)
                }
                if scenario == "missing-state" {
                    fmt.Fprintf(w, `{"Id":%q}`, observed)
                    return
                }
                status := "exited"
                if scenario == "unknown-state" {
                    status = "PASSWORD=SUPERSECRET_STATUS"
                }
                fmt.Fprintf(w, `{"Id":%q,"State":{"Status":%q}}`, observed, status)
            }))
            defer server.Close()
            runner := LocalRunner{dockerClient: func() (*client.Client, error) {
                return client.NewClientWithOpts(client.WithHost(server.URL), client.WithVersion("1.47"))
            }}
            result, err := runner.Execute(context.Background(), Receipt{Kind: ContainerDiagnose, Target: id})
            if err == nil || result.Output != "" || writes.Load() != 0 ||
                strings.Contains(err.Error(), "SUPERSECRET") {
                t.Fatalf("invalid Docker result leaked or accepted: %+v %v", result, err)
            }
        })
    }
}

func TestContainerDiagnosisInvalidTargetNeverContactsDocker(t *testing.T) {
    var called atomic.Int32
    runner := LocalRunner{dockerClient: func() (*client.Client, error) {
        called.Add(1)
        return nil, fmt.Errorf("must not dial")
    }}
    for _, id := range []string{"", "container-name", "../traversal", "--privileged", strings.Repeat("A", 64)} {
        result, err := runner.Execute(context.Background(), Receipt{Kind: ContainerDiagnose, Target: id})
        if err == nil || result.Output != "" {
            t.Fatalf("malformed target accepted: %q", id)
        }
    }
    if called.Load() != 0 {
        t.Fatal("invalid target reached Docker")
    }
}
