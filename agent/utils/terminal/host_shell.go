package terminal

import "errors"

var hostShellSlots = make(chan struct{}, 16)

// NewHostShell owns a real PTY on this Agent. Only trusted terminal routes may call it.
// Capacity is held for the full session, including its bounded reconnect grace.
func NewHostShell(command string) (*LocalCommand, error) {
	select {
	case hostShellSlots <- struct{}{}:
	default:
		return nil, errors.New("local terminal session limit reached")
	}
	release := func() { <-hostShellSlots }
	var shell *LocalCommand
	var err error
	if command == "" {
		shell, err = NewCommand("/bin/bash", "--login")
	} else {
		shell, err = NewCommand("/bin/bash", "-c", command)
	}
	if err != nil {
		release()
		return nil, err
	}
	shell.onClose = release
	return shell, nil
}
