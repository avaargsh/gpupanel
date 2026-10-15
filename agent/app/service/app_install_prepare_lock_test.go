package service

import (
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestAppInstallPreparationSameNameSerializesCaseInsensitive(t *testing.T) {
	release := lockAppInstallPreparation("  Notebook-Study  ")
	defer releaseIfHeld(&release)

	attempted := make(chan struct{})
	acquired := make(chan struct{})
	go func() {
		close(attempted)
		done := lockAppInstallPreparation("notebook-study")
		close(acquired)
		done()
	}()
	<-attempted
	select {
	case <-acquired:
		t.Fatal("same installation name entered critical section twice")
	case <-time.After(25 * time.Millisecond):
	}
	release()
	release = nil
	select {
	case <-acquired:
	case <-time.After(2 * time.Second):
		t.Fatal("same-name waiter never acquired lock after release")
	}
}

func releaseIfHeld(done *func()) {
	if *done != nil {
		(*done)()
	}
}

func TestAppInstallPreparationIndependentNames(t *testing.T) {
	release := lockAppInstallPreparation("jupyter")
	defer release()

	acquired := make(chan struct{})
	go func() {
		done := lockAppInstallPreparation("maxkb")
		close(acquired)
		done()
	}()
	select {
	case <-acquired:
	case <-time.After(2 * time.Second):
		t.Fatal("different app names unnecessarily block each other")
	}
}

func TestAppInstallPreparationConcurrentCallersAndCleanup(t *testing.T) {
	const goroutines = 48
	var wg sync.WaitGroup
	var active int32
	var conflicts int32

	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			name := "agent-lab"
			if i%2 == 0 {
				name = strings.ToUpper(name)
			}
			done := lockAppInstallPreparation(name)
			if atomic.AddInt32(&active, 1) != 1 {
				atomic.AddInt32(&conflicts, 1)
			}
			time.Sleep(time.Millisecond)
			atomic.AddInt32(&active, -1)
			done()
		}(i)
	}
	wg.Wait()
	if conflicts != 0 {
		t.Fatalf("%d overlapping same-name installations", conflicts)
	}
	if active != 0 {
		t.Fatalf("active critical sections after completion: %d", active)
	}
	appInstallPreparationLocks.Lock()
	pending := len(appInstallPreparationLocks.byName)
	appInstallPreparationLocks.Unlock()
	if pending != 0 {
		t.Fatalf("lock entries leaked after work completed: %d", pending)
	}
}
