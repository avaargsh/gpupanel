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

func TestDockerObservationAndPreconditions(t *testing.T) {
	for _, scenario := range []string{"changed", "auto-remove", "restart-error", "observe-error", "unchanged", "verified"} {
		t.Run(scenario, func(t *testing.T) {
			var inspections, restarts atomic.Int32
			id := strings.Repeat("a", 64)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				if strings.HasSuffix(r.URL.Path, "/restart") {
					restarts.Add(1)
					if scenario == "restart-error" {
						w.WriteHeader(500)
						fmt.Fprint(w, `{"message":"uncertain"}`)
						return
					}
					w.WriteHeader(204)
					return
				}
				if !strings.HasSuffix(r.URL.Path, "/json") {
					t.Errorf("unexpected route: %s", r.URL.Path)
					w.WriteHeader(404)
					return
				}
				n := inspections.Add(1)
				if scenario == "observe-error" && n > 1 {
					w.WriteHeader(500)
					fmt.Fprint(w, `{"message":"unavailable"}`)
					return
				}
				started := "previous"
				if scenario == "changed" || (scenario == "verified" && n > 1) {
					started = "new"
				}
				fmt.Fprintf(w, `{"Id":%q,"Name":"/owned-test","State":{"Running":true,"StartedAt":%q},"HostConfig":{"AutoRemove":%t}}`, id, started, scenario == "auto-remove")
			}))
			defer server.Close()
			runner := LocalRunner{dockerClient: func() (*client.Client, error) {
				return client.NewClientWithOpts(client.WithHost(server.URL), client.WithVersion("1.47"))
			}}
			ctx, cancel := context.WithTimeout(context.Background(), 400*time.Millisecond)
			defer cancel()
			result, err := runner.Execute(ctx, Receipt{Kind: Restart, Target: id, Expected: "previous"})
			switch scenario {
			case "changed", "auto-remove":
				if err == nil || restarts.Load() != 0 || result.Verified {
					t.Fatal("precondition failure mutated target")
				}
			case "restart-error", "observe-error", "unchanged":
				if err == nil || !result.Unknown || result.Verified || restarts.Load() != 1 {
					t.Fatalf("uncertainty misreported: %+v %v %d", result, err, restarts.Load())
				}
			case "verified":
				if err != nil || !result.Verified || restarts.Load() != 1 {
					t.Fatalf("verified result missing: %+v %v", result, err)
				}
			}
		})
	}
}
