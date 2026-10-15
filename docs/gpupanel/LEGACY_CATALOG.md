# GPUPanel legacy upstream App Store retirement

From this change onward, **GPUPanel no longer automatically fetches or displays the inherited 1Panel remote catalog**.

## Actual changes
- Removed the randomized scheduled job registering `NewAppStoreJob()`; it will not periodically import upstream app definitions.
- `AppService.GetAppUpdate()` returns no update without hitting the old upstream repository; `SyncAppListFromRemote()` rejects direct attempts, including the existing authenticated API route.
- App discovery and recommended apps exclude `resource=remote`, including data synced in prior installations.
- **No SQL table, application definition, AppInstall, Compose file, container, volume, image, icon or existing cache is deleted.**

## Compatibility
- Existing remote-sourced installed apps remain in storage and continue through the existing Installed Apps/operational API paths. Their metadata must not be purged while installs reference it.
- Existing remote app catalog upgrades may not be offered after retirement; do not imply automatic security updates for legacy installed apps. Manual migration requires a verified substitute and backup.
- Existing `resource=local` and `resource=custom` remain available for compatibility, but the GPUPanel native Catalog is the future authoritative user-facing directory.
- Read-only Catalog manifests can be inspected without Docker; **no executable Catalog recipe is approved yet**.

## Cleanup phase (not automatic)
A future explicit maintenance command may report orphaned *remote* app records, but it must first join against `AppInstall`, runtime records and references in backups, produce a dry-run, require authorization, and provide an independently tested rollback. Do not clean databases by `DELETE WHERE resource=remote`.

## Checks
```sh
python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_legacy_catalog.py' -v
cd agent && go test ./app/service -run TestLegacyRemoteCatalogCannotBeReenabled -count=1
```
