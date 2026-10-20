package server

import (
	"context"
	"errors"
	"net"
)

// UnixPeerIdentity is kernel-reported transport evidence for an accepted
// Unix-domain connection. It identifies the connecting OS process, not a
// browser user, Core principal, workspace, or native session owner.
type UnixPeerIdentity struct {
	PID int
	UID uint32
	GID uint32
}

type unixPeerIdentityContextKey struct{}

// unixPeerIdentityEvidence records either a verified kernel identity or the
// reason it could not be obtained. Missing evidence is never silently treated
// as an authenticated principal.
type unixPeerIdentityEvidence struct {
	Identity *UnixPeerIdentity
	Err      error
}

func withUnixPeerIdentity(ctx context.Context, conn net.Conn) context.Context {
	evidence := unixPeerIdentityEvidence{Err: errors.New("peer identity unavailable")}
	if _, ok := conn.(*net.UnixConn); !ok {
		evidence.Err = errors.New("peer identity requires a Unix-domain connection")
		return context.WithValue(ctx, unixPeerIdentityContextKey{}, evidence)
	}
	evidence.Identity, evidence.Err = readUnixPeerIdentity(conn)
	return context.WithValue(ctx, unixPeerIdentityContextKey{}, evidence)
}

// UnixPeerIdentityFromContext returns the kernel-reported peer identity when
// available. Callers must not use this as end-user authentication or session
// ownership proof; unavailable evidence is returned as an error.
func UnixPeerIdentityFromContext(ctx context.Context) (UnixPeerIdentity, error) {
	if ctx == nil {
		return UnixPeerIdentity{}, errors.New("request context unavailable")
	}
	evidence, ok := ctx.Value(unixPeerIdentityContextKey{}).(unixPeerIdentityEvidence)
	if !ok {
		return UnixPeerIdentity{}, errors.New("Unix peer identity evidence absent")
	}
	if evidence.Err != nil {
		return UnixPeerIdentity{}, evidence.Err
	}
	if evidence.Identity == nil {
		return UnixPeerIdentity{}, errors.New("Unix peer identity evidence empty")
	}
	return *evidence.Identity, nil
}
