# Ubuntu local identity pairing — experimental

Status: **not accepted on a real host**. Implementation depends on
[PR #168](https://github.com/avaargsh/gpupanel/pull/168).

This optional feature verifies that a particular browser login instance and a
local Linux process have completed a short-lived challenge. It grants **no**
ability to execute code or control a Codex session.

## Operator workflow

1. On a disposable Ubuntu development machine, set
   `GPUPANEL_ENABLE_NATIVE_PEER_PROOF=1` for the GPUPanel Core process.
   Without the flag the feature is disabled. The listener requires a trusted
   local Core environment and refuses startup when prerequisites are missing.
2. Sign in to GPUPanel from the machine's loopback address; open
   `/native-principal`. Select the local node.
3. From your own Ubuntu terminal run `id -u`; enter that UID in the page.
4. Begin pairing, then run the exact Python command shown in the page as your
   ordinary login user. Paste the short-lived challenge at its hidden prompt.
5. Return to the page and select **核对身份状态** to check the result.
   Select **撤销本次绑定** when finished.

A successful result shows `PeerObserved` with a verified numeric UID and
`executionAuthorized=false`. It expires within five minutes. Logging out
also revokes the current browser session's matching proof.

## Architecture and security limits

The browser must have an actual live Core login and pass standard CSRF checks.
The API refuses remote and forwarded requests as well as API-key and internal
request bypasses. The local verification listener uses an AF_UNIX socket and
Linux `SO_PEERCRED`; a client-provided user name or UID alone never completes
the challenge.

The Core process owns the temporary local listener. Challenges expire after
60 seconds and cannot be replayed. The feature remains inactive unless
explicitly enabled. An in-progress session may be interrupted or lost during
Core restart; users must begin a fresh pairing rather than replay old inputs.

The proof does not establish native Codex session ownership, actual running
process status, permission to inspect another account's files, or permission
to approve tool calls. GPUPanel Host/Terminal remains independent.

## Test requirements

Source tests must pass on the exact commit: Go security/HTTP/session tests,
Python user CLI tests, and frontend typecheck/build. Actual acceptance still
requires a disposable Ubuntu device, a real signed-in browser, a real non-root
login account, a different-account denial case, logout/expiry/replay tests
and restart recovery. CI alone is not real-host proof.

No GPUPanel G3–G6 acceptance result changes with this feature.
