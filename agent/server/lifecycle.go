package server

import (
	"context"
	"errors"
	"net"
	"net/http"
	"time"
)

// serveOwnedMasterSocket closes only the listener this process successfully
// created. Existing socket paths remain subject to ensureMasterSocketVacant;
// unclean-crash leftovers are never removed automatically.
func serveOwnedMasterSocket(ctx context.Context, server *http.Server, listener net.Listener) error {
	defer listener.Close()
	finished, shutdownDone := make(chan struct{}), make(chan struct{})
	var shutdownErr error
	go func() {
		defer close(shutdownDone)
		select {
		case <-ctx.Done():
			deadline, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			shutdownErr = server.Shutdown(deadline)
			if shutdownErr != nil {
				shutdownErr = errors.Join(shutdownErr, server.Close())
			}
		case <-finished:
		}
	}()
	serveErr := server.Serve(listener)
	close(finished)
	<-shutdownDone
	if errors.Is(serveErr, http.ErrServerClosed) {
		return shutdownErr
	}
	return errors.Join(serveErr, shutdownErr)
}
