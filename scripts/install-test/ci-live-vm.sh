#!/usr/bin/env bash
# Real, networked, task-owned Ubuntu 24.04 VM acceptance on an ephemeral CI runner.
# The only installed GPUPanel services are INSIDE our fresh QEMU guest.
# Never upload the installer stdout, generated login credentials, guest disk or screenshots.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [[ "${CI:-}" != true || "${GITHUB_ACTIONS:-}" != true ||
      "${RUNNER_OS:-}" != Linux ||
      "${GITHUB_REPOSITORY:-}" != avaargsh/gpupanel ]]; then
    echo 'REFUSED: task-owned live VM CI runs only in the canonical GitHub ephemeral Linux runner' >&2
    exit 3
fi
if [[ ! "${GITHUB_SHA:-}" =~ ^[0-9a-f]{40}$ ]] ||
   [[ "$(git rev-parse HEAD)" != "$GITHUB_SHA" ]] ||
   [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
    echo 'REFUSED: expected exact clean GitHub checkout' >&2
    exit 3
fi
for name in qemu-system-x86_64 qemu-img ssh scp gpgv curl go pnpm; do
    command -v "$name" >/dev/null || { echo "REFUSED: missing $name" >&2; exit 3; }
done
if [[ ! -c /dev/kvm || ! -r /dev/kvm || ! -w /dev/kvm ]]; then
    echo 'BLOCKED: /dev/kvm unavailable; real VM has not been booted' >&2
    exit 3
fi
STATE="$ROOT/.local/install-test"
mkdir -p "$STATE"
STAGES="$STATE/ci-stages.txt"
: > "$STAGES"
stage() { printf '%s\n' "$1" >> "$STAGES"; echo "LIVE VM stage completed: $1"; }

VERSION="ci-${GITHUB_SHA:0:12}"
export VERSION
bash deploy/build.sh
release="build/gpupanel-${VERSION}-linux-amd64.tar.gz"
test -s "$release"
stage 'source_release_built'

# Exact signed Ubuntu cloud image; VM helpers refuse altered backing checksum,
# foreign PID or occupied loopback ports. No installer runs on CI host.
python3 scripts/install-test/vm.py prepare
stage 'signed_ubuntu_image_prepared'
python3 scripts/install-test/vm.py start
stage 'task_owned_vm_booted'

# Installation prerequisites execute only within the isolated guest.
python3 scripts/install-test/vm.py ssh -- sudo apt-get update -qq
python3 scripts/install-test/vm.py ssh -- sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker.io docker-compose-v2 busybox-static
python3 scripts/install-test/vm.py ssh -- sudo systemctl enable --now docker
python3 scripts/install-test/vm.py ssh -- sudo docker info --format '{{.ServerVersion}}'
stage 'guest_docker_ready'

# Capture the real pre-install baseline before sealing the checkpoint.
python3 scripts/install-test/preinstall-rollback-live.py capture

# Mandatory offline, standalone pre-install disk checkpoint.
python3 scripts/install-test/vm.py stop
python3 scripts/install-test/vm.py checkpoint
checkpoint_count="$(find "$STATE/ubuntu2404/checkpoints" -mindepth 1 -maxdepth 1 -type d -name 'checkpoint-*' | wc -l)"
if [[ "$checkpoint_count" != 1 ]]; then
    echo 'BLOCKED: expected exactly one owned offline checkpoint' >&2
    exit 3
fi
checkpoint_name="$(find "$STATE/ubuntu2404/checkpoints" -mindepth 1 -maxdepth 1 -type d -name 'checkpoint-*' -printf '%f\n')"
python3 scripts/install-test/vm.py verify-checkpoint "$checkpoint_name" >/dev/null
python3 scripts/install-test/preinstall-rollback-live.py bind-checkpoint "$checkpoint_name"
stage 'offline_checkpoint_sealed'
python3 scripts/install-test/vm.py start

# Install only built and operator-gated fixture payload into owned guest.
python3 scripts/install-test/vm.py copy "$release"
archive="$(basename "$release")"
package="${archive%.tar.gz}"
# Compare local built release TAR SHA to the actual bytes received in the
# owned guest BEFORE running tar or any installer payload.
python3 scripts/install-test/release-transfer.py
stage 'guest_release_archive_verified'
python3 scripts/install-test/vm.py ssh -- sudo tar -xzf "/tmp/$archive" -C /tmp
python3 scripts/install-test/vm.py ssh -- python3 "/tmp/$package/gpupanel-install-preflight.py" --json > "$STATE/preflight.raw.json"
# Inspect the exact preflight JSON instead of treating exit 0 as permission.
python3 - <<'PY'
import json
from pathlib import Path
data=json.loads(Path('.local/install-test/preflight.raw.json').read_text())
required={'operating_system','runtime_collision','runtime_path_symlink','disk_space'}
checks=data['checks']
by_code={entry['code']:entry['state'] for entry in checks}
assert len(by_code)==len(checks)
assert data['product']=='GPUPanel' and data['installable'] is False
assert data['safe_to_install'] is False and not data['blockers']
assert all(by_code.get(key)=='PASS' for key in required), 'Guest preflight refused'
PY
stage 'guest_read_only_preflight_accepted'

# stdout includes the random first-login password. Keep private, no CI echo,
# do not upload or include in sanitized artifacts.
python3 scripts/install-test/vm.py ssh -- sudo "/tmp/$package/install.sh" \
  --approve-disposable-vm-install --entrance itest-ci > "$STATE/install.raw.log" 2>&1
chmod 0600 "$STATE/install.raw.log"
python3 scripts/install-test/record_credentials.py
stage 'guest_fresh_install'

# G3 read-only guest ownership check. The opt-only development installer
# MUST NOT leave global compatibility aliases, while both systemd units must
# execute exactly the real files under /opt/gpupanel.
#
# Fail each predicate EXPLICITLY: in POSIX shell -e does not abort on the
# left-hand side of an AND-list, so '[ -f ... ] && [ -x ... ]' can be
# silently skipped. A green live-VM job must not be a false positive.
# This does NOT execute or certify A→B→A upgrade/rollback.
if ! python3 scripts/install-test/vm.py ssh -- sudo sh -euc '
  test "$(readlink -f /opt/gpupanel)" = /opt/gpupanel || exit 31
  test -f /opt/gpupanel/pctl || exit 32
  test ! -L /opt/gpupanel/pctl || exit 33
  test ! -e /usr/local/bin/pctl || exit 34
  test ! -L /usr/local/bin/pctl || exit 35
  for role in core agent; do
    binary="/opt/gpupanel/gpupanel-$role"
    alias="/usr/local/bin/gpupanel-$role"
    unit="/etc/systemd/system/gpupanel-$role.service"
    test -f "$binary" || exit 36
    test -x "$binary" || exit 37
    test ! -L "$binary" || exit 38
    test ! -e "$alias" || exit 39
    test ! -L "$alias" || exit 40
    test -f "$unit" || exit 41
    test ! -L "$unit" || exit 42
    test "$(grep -Fxc "ExecStart=$binary" "$unit")" = 1 || exit 43
    test "$(grep -Fxc "WorkingDirectory=/opt/gpupanel" "$unit")" = 1 || exit 44
  done
' > "$STATE/upgrade-runtime-identity.raw.log" 2>&1; then
  echo 'BLOCKED: installed guest runtime ownership differs from reviewed opt-only systemd layout' >&2
  exit 3
fi
echo 'G3 real guest opt-only runtime identity checked (read-only); upgrade/rollback NOT_RUN'

# Bind the live API acceptance to the exact backend bytes built from this
# checkout. A source-level UUID guard is not proof that the installed Agent
# actually contains it. This check is read-only and runs before any AppInstall
# mutation; never retry a request to diagnose a binary mismatch.
for role in core agent; do
  local_sha="$(sha256sum "$ROOT/build/gpupanel-$role" | awk '{print $1}')"
  guest_sha_bin="$(python3 scripts/install-test/vm.py ssh -- sudo sha256sum "/opt/gpupanel/gpupanel-$role" | awk '{print $1}')"
  if [[ ! "$local_sha" =~ ^[0-9a-f]{64}$ || "$guest_sha_bin" != "$local_sha" ]]; then
    echo "BLOCKED: installed $role binary does not match exact candidate build; AppInstall mutation NOT_RUN" >&2
    exit 3
  fi
  echo "G3 installed $role binary SHA-256 matches exact candidate build: $local_sha"
done
stage 'installed_backend_binary_identity_matched'

# A real browser against installed Core+Agent with no route mocks, then
# guest-only controlled restart/SIGKILL/recovery.
if ! python3 scripts/install-test/browser.py > "$STATE/browser.raw.log" 2>&1; then
    python3 scripts/install-test/ci-failure.py browser
    exit 1
fi
stage 'real_installed_browser'
if ! python3 scripts/install-test/runtime.py > "$STATE/runtime.raw.log" 2>&1; then
    python3 scripts/install-test/ci-failure.py runtime
    exit 1
fi
stage 'guest_agent_recovery'

# G5 AppInstall negative contract: one authenticated but nonexistent AppDetail
# is refused without TaskDB/AppInstall or Docker side effects. Never auto-retry,
# and never claim that a legitimate app was installed.
if ! python3 scripts/install-test/app-rejection-live.py > "$STATE/app-rejection.raw.log" 2>&1; then
    python3 scripts/install-test/ci-failure.py app-rejection
    exit 1
fi
stage 'guest_app_install_denied_without_side_effects'

# Real Docker Engine/Compose, but NOT the GPUPanel AppInstall API: build
# a trusted *local* scratch image, run only inside the disposable guest with
# no container network/host ports; verify logs, restart, persisted file and
# exact project-only cleanup.
python3 scripts/install-test/vm.py copy scripts/install-test/compose-fixture-guest.py
if ! python3 scripts/install-test/compose-live.py > "$STATE/compose.raw.log" 2>&1; then
    python3 scripts/install-test/ci-failure.py compose
    exit 1
fi
stage 'guest_compose_offline_lifecycle'

# Full GPUPanel Core -> Agent -> real guest Docker fixture. Import an apt-
# sourced static BusyBox without network pulls; the API request explicitly
# selects network=none and Docker inspection verifies the isolation.
python3 scripts/install-test/vm.py ssh -- sudo tar -C / --dereference -cf /tmp/gpupanel-m0-busybox.tar bin/busybox
python3 scripts/install-test/vm.py ssh -- sudo docker import /tmp/gpupanel-m0-busybox.tar gpupanel-m0-fixture:local
stage 'guest_core_fixture_image_prepared'
if ! python3 scripts/install-test/container.py > "$STATE/container.raw.log" 2>&1; then
    python3 scripts/install-test/ci-failure.py container
    exit 1
fi
stage 'real_core_agent_container_lifecycle'

# Run the real GPUPanel AppInstall admission+uninstall through Core/Agent
# on this same VM. Use local catalog and offline network-isolated image.
python3 scripts/install-test/vm.py copy scripts/install-test/app-fixture-guest.py
if ! python3 scripts/install-test/app-install-live.py > "$STATE/app-install.raw.log" 2>&1; then
    python3 scripts/install-test/ci-failure.py app-install
    exit 1
fi
stage 'real_offline_appinstall_core_taskdb_docker'

# Only the disposable guest disk is fault-injected and cold-restored.
# A sealed post-install checkpoint is independently validated before
# replacing the task-owned disk; the prior disk is retained for review.
if ! python3 scripts/install-test/restore-live.py > "$STATE/restore.raw.log" 2>&1; then
    python3 scripts/install-test/ci-failure.py restore
    exit 1
fi
stage 'guest_post_install_offline_restore'

# Restore the pre-install disk after a controlled partial-write fault.
# This proves manual fresh-install rollback only; A->B->A upgrade stays NOT_RUN.
if ! python3 scripts/install-test/preinstall-rollback-live.py restore > "$STATE/preinstall-rollback.raw.log" 2>&1; then
    echo 'G3_PREINSTALL_ROLLBACK_CODE=restore-failed release=NO_GO' >&2
    exit 1
fi
stage 'guest_preinstall_rollback_recovered'

# Full AppInstall, production upgrade/rollback and broad data restore remain
# NOT RUN; do not promote this partial proof to M0 release GO.
echo 'LIVE VM partial acceptance PASSED; fresh-install snapshot rollback PASS; M0 release decision remains NO_GO'
