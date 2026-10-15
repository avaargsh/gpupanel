# Ubuntu 24.04 personal development environment: Profile / Lock / Bundle

This is an executable, deliberately **non-destructive** Stage-0 utility for the personal Ubuntu Desktop workflow. It checks tool presence, verifies and retrieves explicitly SHA-256-pinned HTTPS artifacts, and exports/imports verified offline bundles. It **does not install packages**, modify apt sources, execute remote scripts, configure VPNs or require root.

Quick start from repository root:

    python3 scripts/gpupanel-bootstrap.py doctor
    python3 scripts/gpupanel-bootstrap.py plan
    python3 scripts/gpupanel-bootstrap.py verify

Initially the lock file has **no download artifacts**; this is intentional. Before any software is distributable, maintainers must add explicit HTTPS mirrors, immutable SHA-256 digests, licenses, architecture/version, and provenance. Never accept an unpinned latest release as a lock. Missing tool status is not a permission to install.

For a vetted lock containing artifact entries:

    python3 scripts/gpupanel-bootstrap.py fetch
    python3 scripts/gpupanel-bootstrap.py verify
    python3 scripts/gpupanel-bootstrap.py bundle ./gpupanel-offline.zip

On another Ubuntu machine, copy both the original profile lock and the bundle:

    python3 scripts/gpupanel-bootstrap.py import-bundle ./gpupanel-offline.zip
    python3 scripts/gpupanel-bootstrap.py fetch --offline
    python3 scripts/gpupanel-bootstrap.py verify

The archive format embeds the exact profile lock and verifies every artifact before entering the cache. Bundle operations do not install or run artifacts. Lock parsing rejects path traversal and non-HTTPS mirrors. This foundation lets a later installer consume the verified cache with **separate explicit approval, rollback, provenance and smoke tests**.

Tests (no third-party packages or network):

    python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_bootstrap.py' -v

Security acceptance before introducing installation: system capability matrix, dependency signatures, proxy/no-proxy mirror handling, local cache safety, deterministic exit status, rollback, and Ubuntu 24.04 physical host smoke tests.
