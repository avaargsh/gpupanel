# Docker smoke: ambiguous create and cleanup ownership

The disposable Docker engine acceptance CLI intentionally runs on a user-approved Docker context and must never delete a preexisting container when cleanup encounters an uncertain state.

The lifecycle now attaches `io.gpupanel.smoke.nonce=<unique-token>` to each new container. After attempting `docker create`, **including when its CLI response is lost or errors**, cleanup reads the nonce from Docker inspect and calls `docker rm -f` **only when the inspected nonce matches**. A missing daemon, unavailable inspection or different label yields a FAILED result with explicit manual resource inspection instead of a false cleanup-success claim.

The fake-Docker regression suite covers: successful cleanup, failed workload, create acknowledgment lost after daemon side-effects, a foreign name collision, and failed cleanup. The workflow additionally runs a real Docker-engine smoke using an offline-built local scratch image and asserts there are no remaining `gpupanel-accept-` containers.

This does not establish GPUPanel authenticated API health or full Host G5 acceptance.
