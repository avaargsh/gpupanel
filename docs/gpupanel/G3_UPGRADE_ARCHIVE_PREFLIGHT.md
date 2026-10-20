# G3: release archive pre-extraction safety gate (Draft)

This work is rebased as an independent follow-up to merged GPUPanel #143 and is not a complete upgrade
implementation or proof of an authenticated release.

## Problem
`UpgradeService.Upgrade` downloads a release `.tar.gz` from the
configured release channel and previously passed it directly to
`files.HandleUnTar` inside the privileged Core. That allows malformed or
redirected TAR members to reach extraction before the existing backup,
inventory and runtime-ownership guards run.

## Proposed guard
`validateUpgradeArchive` now streams the compressed archive **before**
`HandleUnTar`, without creating any new files. It enforces:

- exactly the expected release-root name derived from the validated version,
  OS and architecture; only paths beneath that root
- regular files and directories only, rejecting symlinks, hardlinks, device
  members, absolute paths, `.`/`..` components, duplicates and dangerous
  permission bits
- bounded entry count (4095), compressed input (1 GiB), per-entry body
  (512 MiB) and expanded regular payload (2 GiB)
- nonempty, executable `gpupanel-core`, `gpupanel-agent` and `pctl`,
  and the two expected `initscript/*.service` regular files
- complete bounded gzip/TAR streaming with CRC32/ISIZE verification even after TAR's zero-block EOF, and refusal of concatenated hidden payload/nonzero trailing bytes or padding over 1 MiB; truncation fails, with `O_NOFOLLOW` when
  opening the archive

Normal release builds place assets below
`gpupanel-<version>-linux-<arch>/`, using `deploy/build.sh`. Missing
optional GeoIP and language assets remain permitted by the parent
upgrade guard.

**Never** interpret a successful structural scan as evidence that the
download was produced or signed by the GPUPanel maintainers. The archive
and remote release metadata still lack cryptographic publisher
authentication in the in-app upgrade path. This PR also does not freeze
live SQLite snapshots, ensure service health after rollback, or prevent
time-of-check/time-of-use attacks by a process with write access to the
private staging directory.

## Verification
The offline Go tests generate task-owned tarballs and exercise valid
build layouts, file/directory mismatches, traversal, symlinks, hardlinks,
permission abuse, duplicates, missing files, broken gzip streams and
the ordering of the preflight before extraction/backup.

A CI PASS is a **unit-contract** result, not a two-version live
A→B→A upgrade. Before production G3 approval, run a separate disposable
Ubuntu guest with two signed/digest-pinned candidates and verify
crash/restart behavior, DB integrity, authorization, service health,
and rollback to the original binary + configuration state.

The overall GPUPanel M0 gate remains **NO-GO**.
