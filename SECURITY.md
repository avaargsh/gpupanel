# GPUPanel security policy

**Status:** GPUPanel is a development preview and has **no independently supported production release line** yet. Upstream 1Panel's supported versions do not establish a GPUPanel security SLA.

## Reporting a possible vulnerability

Please use the repository's **Security → Report a vulnerability** private reporting flow if GitHub exposes it for [avaargsh/gpupanel](https://github.com/avaargsh/gpupanel). If that option is unavailable, do **not** put exploit steps, credentials, vulnerable host addresses or customer data in a public Issue. Instead, contact the GPUPanel repository owner through an independently verified private channel. A private reporting channel and response-time commitment have not been independently confirmed here.

Vulnerabilities verified in **unmodified upstream 1Panel** should also be routed according to [1Panel's own security policy](https://github.com/1Panel-dev/1Panel/blob/dev-v2/SECURITY.md). That does not transfer GPUPanel's handling responsibility to the upstream team.

## What to include (privately)

- Affected GPUPanel commit SHA or artifact digest, OS and deployment mode.
- Minimal reproduction with dummy credentials and redacted logs.
- Expected vs actual authorization boundary; impact; conditions needed to reproduce.
- Whether the same behavior reproduces against upstream 1Panel.

## Release controls

Before public distribution: verify safe defaults, OIDC/RBAC boundaries, signed/pinned artifacts, installation and migration rollback, secrets handling, and independent operation outcome evidence. No public claim of production security certification is made by this repository.
