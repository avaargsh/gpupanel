# Native Codex Sessions: local-user read-only preview (not a live connector)

- Date: 2026-10-20
- Parent issue: [#164](https://github.com/avaargsh/gpupanel/issues/164)
- Architecture: [ADR-0002](ADR-0002-NATIVE-AGENT-MOBILE-WORKBENCH.md)
- State: **source feature / verification pending**. Not a production agent-session
  service, mobile companion, user binding or GPUPanel G3–G6 release gate.

## A real user workflow (without privileged Host scanning)

As the **same regular Ubuntu login user** that runs Codex:

```bash
cd /path/to/gpupanel
python3 scripts/gpupanel-codex-sessions.py list > codex-sessions.json
```

Then sign in to GPUPanel, select the local node and open **Agent Sessions**
(`/agent-sessions`). Use the browser's local file chooser to select the newly
created JSON file. It is read only in the current browser page and **is not
POSTed to Core or Relay**. Clear the import, change nodes or reload to remove
the in-memory view. Keep the exported JSON under your control: even sanitized
session IDs and project basenames are personal development metadata.

If the script refuses inspection, do not run it using sudo, modify permissions
or instruct the GPUPanel root Agent to scan `/home/*`. Fix the user-owned Codex
installation/layout independently.

## Exactly what the script reads

Only `/home/<current OS user>/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`,
with no symlink traversal. Directory ownership/mode and opened regular file
ownership are checked. At most 2,000 directory entries are visited, 16 KiB of
the **first line** of each qualifying file is read, and 100 session summaries
are returned. A too-large/unsafe archive refuses complete export. Missing
archive returns an empty result; it is not proof that Codex is absent.

For each `session_meta` line, the only emitted data is its native UUID,
a bounded project-directory **basename** (not the full path) and original
session timestamp, with `runtimeKind=codex` and `liveness=unknown`.
The tool does not read conversation messages, commands, reasoning, API
tokens or later rollout events. It does not launch/resume/stop Codex.

The browser checks a versioned `schemaVersion:1`/read-only schema,
bounded file size and rows, UUID format and unsupported values.
Imported JSON is user-selected and **not cryptographically attested**:
neither GPUPanel's authenticated administrator nor its Agent can claim to
have independently verified the import's owner or actual running process.

## Boundaries and limitations

- Reading a recorded native Session ID **does not** prove it is currently
  loaded, alive, executing, blocked or ready for an approval.
- Files under alternative `CODEX_HOME`, archived/compressed `.zst` rollouts
  and ephemeral/no-rollout sessions are not enumerated in this slice.
- The script reads only the standard Linux user home layout. It does not
  operate on macOS, Windows, network mounts, root accounts or a different UID.
- No browser API may invoke a privileged command; no remote action or automatic
  Host/Core background polling is enabled.
- A Project `Registered` record still does not establish an OS workspace
  identity or authorize associating it with a Codex Session.
- Visual inspection on a real Ubuntu browser/host is still required. CI unit
  tests use disposable synthetic session metadata and are not real Codex
  execution evidence.

## Recovery and tests

Removing the export file and refreshing the page clears the transient display;
the native Codex archive is never modified. After changing the native archive,
rerun the export manually. Import parse errors are visible; they do not reuse
a previous snapshot or silently substitute empty success.

```bash
python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_codex_sessions.py' -v
cd frontend && pnpm typecheck && pnpm test && pnpm build
```

For the next milestone, independently bind a GPUPanel Web user to a specific
non-root Linux principal, and add a read-only native Runtime Adapter (prefer
official Codex app-server `thread/list`) running under that principal. Only
then can the UI transition from manual archive import to live observation.
Mobile Session Sync and any remote write are separate later acceptance gates.
