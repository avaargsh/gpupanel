package hostops

import (
    "context"
    "crypto/sha256"
    "encoding/hex"
    "encoding/json"
    "os"
    "strings"
    "testing"
    "time"

    "github.com/docker/docker/api/types"
    "github.com/glebarez/sqlite"
    "gorm.io/gorm"
)

// Opt-in LIVE Docker test. Never run with a preexisting workload: the canary
// must be freshly created by our isolated CI workflow and remain label-bound.
// No cleanup or container discovery happens inside this test.
func TestOwnedDockerStartStopRestartLifecycle(t *testing.T) {
    id, run, image := os.Getenv("GPUPANEL_HOSTOPS_CANARY"), os.Getenv("GPUPANEL_HOSTOPS_RUN"), os.Getenv("GPUPANEL_HOSTOPS_IMAGE")
    if id == "" || run == "" || image == "" {
        t.Skip("requires explicit disposable Docker canary ID, unique run label and local image digest")
    }
    if !fullContainerID.MatchString(id) || !strings.HasPrefix(image, "sha256:") || len(image) != 71 {
        t.Fatal("refuse canary without exact full ID and image digest")
    }
    ctx, cancel := context.WithTimeout(context.Background(), 115*time.Second)
    defer cancel()
    cli, err := localDocker()
    if err != nil { t.Fatal(err) }
    defer cli.Close()
    inspect := func() types.ContainerJSON {
        t.Helper()
        info, err := cli.ContainerInspect(ctx, id)
        if err != nil { t.Fatal(err) }
        if info.ID != id || info.Config == nil || info.HostConfig == nil ||
            info.Config.Labels["gpupanel.hostops.acceptance"] != run ||
            info.Image != image || len(info.Mounts) != 0 ||
            info.HostConfig.Privileged || info.HostConfig.AutoRemove ||
            info.HostConfig.NetworkMode != "none" || len(info.HostConfig.PortBindings) != 0 ||
            info.Config.User != "65534:65534" || !info.HostConfig.ReadonlyRootfs ||
            info.HostConfig.PidsLimit == nil || *info.HostConfig.PidsLimit > 64 ||
            info.HostConfig.Memory <= 0 || info.HostConfig.Memory > 134217728 ||
            !strings.Contains(strings.Join(info.HostConfig.SecurityOpt, ","), "no-new-privileges") ||
            !strings.Contains(strings.ToLower(strings.Join(info.HostConfig.CapDrop, ",")), "all") {
            t.Fatal("foreign or insufficiently isolated Docker container; refuse mutation")
        }
        return info
    }

    initial := inspect()
    if initial.State == nil || initial.State.Status != "created" || initial.State.Running {
        t.Fatal("canary must be a newly created, stopped container")
    }
    engine, _, path := testEngine(t)
    engine.Runner = LocalRunner{}
    owner := "canary:session"
    steps := []struct {kind, key string}{
        {Start, "canary-start-first"}, {Stop, "canary-stop"}, {Start, "canary-start-again"}, {Restart, "canary-restart"},
    }
    evidence := make([]map[string]interface{}, 0, len(steps))
    for _, step := range steps {
        before := inspect()
        prior, snapshotErr := snapshotContainerState(before)
        if snapshotErr != nil { t.Fatal(snapshotErr) }
        plan, err := engine.Plan(ctx, owner, PlanRequest{Kind:step.kind, Target:id, Key:step.key})
        if err != nil { t.Fatalf("%s preview failed: %v",step.kind,err) }
        afterPreview := inspect()
        previewSnapshot, snapshotErr := snapshotContainerState(afterPreview)
        if snapshotErr != nil || previewSnapshot != prior {
            t.Fatalf("%s preview mutated container",step.kind)
        }
        same, err := engine.Plan(ctx, owner, PlanRequest{Kind:step.kind, Target:id, Key:step.key})
        if err != nil || same.ID != plan.ID { t.Fatal("plan idempotency failed") }
        if _, err := engine.Execute(ctx, owner, plan.ID, ConfirmRequest{Hash:plan.Hash, Confirm:false}); err == nil {
            t.Fatal("operation confirmed without explicit consent")
        }
        result, err := engine.Execute(ctx, owner, plan.ID, ConfirmRequest{Hash:plan.Hash, Confirm:true})
        if err != nil || result.State != "verified" || !result.Verified {
            t.Fatalf("%s not verified: state=%q error=%v",step.kind,result.State,err)
        }
        after := inspect()
        verified := false
        if step.kind == Restart {
            verified = after.ID == id && after.State != nil && after.State.Running &&
                after.State.StartedAt != before.State.StartedAt
        } else {
            verified = observedContainerTransition(step.kind,before,after)
        }
        if !verified { t.Fatalf("%s Docker state not independently observed",step.kind) }
        post, err := snapshotContainerState(after)
        if err != nil || post == prior { t.Fatal("mutation did not alter Docker state") }
        replay, err := engine.Execute(ctx, owner, plan.ID, ConfirmRequest{Hash:plan.Hash, Confirm:true})
        if err != nil || replay.ID != plan.ID || replay.State != "verified" { t.Fatal("replay did not return receipt") }
        if snap, err := snapshotContainerState(inspect()); err != nil || snap != post {
            t.Fatal("duplicate confirmation changed container")
        }
        digest := func(s string) string { h := sha256.Sum256([]byte(s)); return hex.EncodeToString(h[:]) }
        evidence = append(evidence,map[string]interface{}{
            "kind":step.kind,"operationId":plan.ID,"receiptState":result.State,
            "receiptVerified":result.Verified,"previewUnchanged":true,"unconfirmedDenied":true,
            "samePlanIdOnRetry":true,"independentInspect":true,"confirmReplayUnchanged":true,
            "preSnapshotSha256":digest(prior),"postSnapshotSha256":digest(post),
        })
    }
    // Simulate an Agent TaskDB reopen. This is not an installed Core/browser test.
    reopened, err := gorm.Open(sqlite.Open(path),&gorm.Config{})
    if err != nil { t.Fatal(err) }
    db, _ := reopened.DB()
    defer db.Close()
    receipts, err := (Engine{DB:reopened}).List(owner)
    if err != nil || len(receipts) != len(steps) { t.Fatal("operation journal not durable after reopen") }
    for _, r := range receipts { if r.State != "verified" || !r.Verified { t.Fatal("incomplete durable receipt") } }
    report := map[string]interface{}{
        "kind":"LIVE isolated Docker SDK + TaskDB canary; not installed Core/browser",
        "checks":evidence,"containerId":id,"imageDigest":image,
        "receiptCountAfterReopen":len(receipts),"canaryLabel":run,
    }
    data, err := json.Marshal(report)
    if err != nil { t.Fatal(err) }
    t.Logf("HOSTOPS_CANARY_PROOF=%s",data)
}
