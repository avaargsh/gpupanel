package hostops

import (
    "context"
    "strings"
    "testing"
)

// Durable SQL claim, owner binding and repeat confirmations apply to new kinds,
// not just to the original restart and diagnostic runners.
func TestDurableStartStopPlansAndNoReplay(t *testing.T) {
    for _, kind := range []string{Start, Stop} {
        t.Run(kind, func(t *testing.T) {
            engine, runner, path := testEngine(t)
            runner.result = Result{Verified:true}
            id := strings.Repeat("a",64)
            intent := PlanRequest{Kind:kind,Target:id,Key:"start-stop-one"}
            plan, err := engine.Plan(context.Background(),"admin:session",intent)
            if err != nil { t.Fatal(err) }
            same, err := engine.Plan(context.Background(),"admin:session",intent)
            if err != nil || same.ID != plan.ID { t.Fatal("plan replay changed identity") }
            if _, err = engine.Plan(context.Background(),"admin:session",PlanRequest{Kind:Restart,Target:id,Key:intent.Key}); err == nil {
                t.Fatal("idempotency key rebound to different kind")
            }
            if _, err = engine.Execute(context.Background(),"other:session",plan.ID,ConfirmRequest{Hash:plan.Hash,Confirm:true}); err == nil {
                t.Fatal("foreign owner confirmed operation")
            }
            if _, err = engine.Execute(context.Background(),"admin:session",plan.ID,ConfirmRequest{Hash:plan.Hash,Confirm:false}); err == nil {
                t.Fatal("confirmation was optional")
            }
            if runner.calls.Load() != 0 { t.Fatal("executed before consent") }
            done,err := engine.Execute(context.Background(),"admin:session",plan.ID,ConfirmRequest{Hash:plan.Hash,Confirm:true})
            if err != nil || done.State != "verified" || !done.Verified { t.Fatalf("unexpected receipt: %+v %v",done,err) }
            replay,err := engine.Execute(context.Background(),"admin:session",plan.ID,ConfirmRequest{Hash:plan.Hash,Confirm:true})
            if err != nil || replay.ID != done.ID || runner.calls.Load() != 1 { t.Fatal("confirmation replayed Docker operation") }
            if path == "" { t.Fatal("no durable TaskDB path") }
        })
    }
}
func TestStartStopPlansRejectMalformedTarget(t *testing.T) {
    engine, runner, _ := testEngine(t)
    for _, kind := range []string{Start, Stop} {
        for _, id := range []string{"short","local",strings.Repeat("A",64)} {
            if _,err := engine.Plan(context.Background(),"admin:session",PlanRequest{Kind:kind,Target:id,Key:"bad-target"}); err == nil {
                t.Fatalf("%s accepted invalid id %q",kind,id)
            }
        }
    }
    if runner.calls.Load() != 0 { t.Fatal("malformed plan executed") }
}
