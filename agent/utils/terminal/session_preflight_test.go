package terminal

import (
	"errors"
	"testing"
	"time"
)

// Authorization must fail before invoking the provider: opening a local PTY
// can spawn a privileged process even if OpenCommand later rejects the session.
func TestServeCommandRejectsInvalidIdentityBeforeProviderStartup(t *testing.T) {
	cases := []struct {
		name      string
		identity  Identity
		sessionID string
	}{
		{
			name:     "missing user",
			identity: Identity{AuthSessionID: "login-1"},
		},
		{
			name:     "missing auth session",
			identity: Identity{UserID: "user-1"},
		},
		{
			name:     "expired lease",
			identity: Identity{UserID: "user-1", AuthSessionID: "login-1", AuthLeaseUntil: time.Now().Add(-time.Minute)},
		},
		{
			name:     "API key missing bounded lease",
			identity: Identity{UserID: "user-1", AuthSessionID: "api-key:stale"},
		},
		{
			name:      "invalid reconnect identity",
			identity:  Identity{AuthSessionID: "login-1"},
			sessionID: "stolen-session-id",
		},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			launched := false
			opts := SessionOptions{
				Identity: tt.identity,
				Kind:     "local",
				Target:   "host-command",
				Cols:     80,
				Rows:     24,
			}
			err := ServeCommand(nil, tt.sessionID, opts, func() (*LocalCommand, error) {
				launched = true
				return nil, errors.New("privileged command provider invoked")
			})
			if err == nil {
				t.Fatal("invalid authorization was accepted")
			}
			if launched {
				t.Fatal("privileged command provider invoked before authorization")
			}
		})
	}
}
