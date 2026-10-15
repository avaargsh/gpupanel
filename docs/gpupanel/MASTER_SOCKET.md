# GPUPanel Agent master UNIX socket startup safety

The inherited Agent master still targets `/etc/1panel/agent.sock`, so GPUPanel remains **NOT independently installable** or safe to run beside a live 1Panel instance.

## Corrected startup behavior

Prior startup unconditionally called `os.Remove(masterSocketPath)` before opening a new listener. If another master was actively listening, a concurrent start could silently unlink its socket path, breaking new connections to the original process.

The Agent now refuses to replace **any** existing socket path (live socket, stale socket, symlink or regular file). Socket parent directory initialization rejects symlinks *before* any chmod; neither a file nor a symlink target is deleted. The listener is created only if the expected path does not exist.

A stale socket following a hard crash causes a **fail-closed startup error**. An operator must confirm the owning process is stopped, inspect the path and remove only the confirmed stale socket. Never use a blind startup `rm -f /etc/1panel/agent.sock` workaround.

Tests: `cd agent && go test ./server -run 'Test(EnsureMasterSocketVacant|PrepareMasterSocketDir)' -count=1`.

## Remaining architectural gate

This narrowly prevents startup from clobbering a different process's control socket. It **does not isolate** the global `/etc/1panel` namespace, Core/Agent databases, the `1pctl` bootstrap contract, service names, secrets, or rollback. Standalone runtime G3 remains BLOCKED pending a full migration and disposable Ubuntu VM acceptance.
