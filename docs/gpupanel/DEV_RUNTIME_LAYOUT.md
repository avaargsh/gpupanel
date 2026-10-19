# GPUPanel Linux development runtime layout

Status: **development-stage, Ubuntu-first, deliberately incompatible with older
experimental installations**. The only default GPUPanel installation prefix is
`/opt/gpupanel`. This design does not relax the existing isolated-VM
authorization or M0 NO-GO release status.

| Path | Owner and purpose |
| --- | --- |
| `/opt/gpupanel/gpupanel-core` | Core executable referenced by systemd |
| `/opt/gpupanel/gpupanel-agent` | Agent executable referenced by systemd |
| `/opt/gpupanel/pctl` | Local management script; run by absolute path |
| `/opt/gpupanel/conf/` | Installed configuration |
| `/opt/gpupanel/db/` | Core/Agent persistent databases |
| `/opt/gpupanel/log/` | Logs |
| `/opt/gpupanel/lang/` | Optional application-local language resources |
| `/opt/gpupanel/geo/` | GeoIP data |
| `/opt/gpupanel/tmp/upgrade/` | In-app staging and rollback records |

Systemd service *unit files* remain under `/etc/systemd/system` by Linux
convention, and their `ExecStart` and `WorkingDirectory` must point to the
owned `/opt/gpupanel` executables/directory. GPUPanel no longer creates
`/usr/local/bin/{pctl,gpupanel-core,gpupanel-agent}` aliases or stores
application language files in `/usr/local/bin/lang`.

Use the full control script path:

```sh
sudo /opt/gpupanel/pctl status
sudo /opt/gpupanel/pctl restart
```

The experimental `--base-dir` option still selects an alternative install
root for disposable fixtures, but the **in-app G3 upgrader** refuses any
unreviewed nondefault or non-systemd installation; do not infer that arbitrary
paths are supported for in-place upgrades.

No automatic compatibility migration, alias recreation or global-bin cleanup
is provided. For existing, untrusted or production hosts, stop at read-only
preflight rather than trying to overwrite another install. For development
testing, use the task-owned Ubuntu 24.04 VM and build a new release candidate;
preserve any previous disposable disk if comparison is needed.

This tree is **not** sufficient evidence for G3 upgrade+rollback GO. Until
a real independent two-candidate VM run demonstrates binary and database
recovery, the Draft upgrade PRs and M0 remain NO-GO.
