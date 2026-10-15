# GPUPanel Host → Docker disposable acceptance

This optional CLI tests a **real local Docker engine** without changing GPUPanel services. The normal command defaults to a read-only plan; it never pulls images and requires an **already cached** `image@sha256:<digest>`. No mutable image tags are accepted.

```bash
python3 scripts/gpupanel-docker-smoke.py --image 'docker.io/library/busybox@sha256:<approved-real-digest>'
# After checking the context and local image source:
python3 scripts/gpupanel-docker-smoke.py --image 'docker.io/library/busybox@sha256:<approved-real-digest>' --approve
```

The placeholder above is NOT an image digest. Supply your approved immutable image and verify it is available locally. This tool requires a non-root user with Docker access. Access to the Docker daemon itself is highly privileged: use a disposable VM/host and an approved Docker context.

On explicit approval it checks Docker availability and locally cached image, creates a unique temporary container with `--pull=never`, `--network=none`, `--read-only`, `--cap-drop=ALL`, `no-new-privileges`, resource limits and **no volumes**; starts a stdlib shell output marker, reads logs and exit code, and deletes the disposable container in `finally`. A failed cleanup is a FAILED result.

This is **not** an authenticated GPUPanel API test, AppStore installation or Kubernetes workload test. Until that independent API/RBAC/browser path is run on disposable Ubuntu 24.04, Host Golden Path G5 remains NOT ACCEPTED.

## Real Docker lifecycle in CI (offline image)

The workflow now compiles a minimal static Go marker with `CGO_ENABLED=0`, packages it in `FROM scratch` **without fetching a base image**, and passes Docker's local content-addressed image ID (`sha256:<64 hex>`) to the smoke runner. The runner uses the fixed `/gpupanel-smoke` entrypoint only with `--fixture-entrypoint`, checks the image ID actually resolved by Docker, and creates/starts/reads/cleans up a real container.

This CI integration checks *Docker Engine lifecycle only*, never GPUPanel HTTP API/RBAC or system services. A locally built image ID is not an externally signed publisher manifest. The normal non-fixture mode still runs a checked `/bin/sh` command in an operator-approved, already-local image@sha256 digest.
