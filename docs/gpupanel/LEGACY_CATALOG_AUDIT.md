# Legacy 1Panel app Catalog: read-only migration evidence

The old remote app feed and web catalog are retired in GPUPanel, but **previously installed applications and original metadata remain** so upgrades, backups, restores and uninstall procedures are not broken by a destructive cleanup.

To audit an existing **offline backup/copy** of the SQLite \`agent.db\`:

\`\`\`bash
python3 scripts/gpupanel-legacy-catalog-audit.py --database /path/to/copied-agent.db
\`\`\`

This command opens the selected database in **SQLite read-only mode**, refuses unknown schemas and symlinks, reports aggregate counts for remote definitions, installation references, detail rows and broken references. It outputs no individual app names or row IDs. No tables are altered and **no purge command exists**.

If you audit a live database rather than a consistent backup, the numbers may be transient; make a safe SQLite backup/snapshot first. A remote definition without an AppInstall reference is *not automatically safe to delete*: external backups, compose state, task history and recovery mechanisms may still refer to it.

Next stage (not included): a migration plan with resolved references and a backup, operator authorization, independent verification, and rollback tested on a disposable Ubuntu 24.04 VM. Keep historical installation management routes available during migration.
