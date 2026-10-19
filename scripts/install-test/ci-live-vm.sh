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
python3 scripts/install-test/vm.py ssh -- sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker.io docker-compose-v2
python3 scripts/install-test/vm.py ssh -- sudo systemctl enable --now docker
python3 scripts/install-test/vm.py ssh -- sudo docker info --format '{{.ServerVersion}}'
stage 'guest_docker_ready'

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
stage 'offline_checkpoint_sealed'
python3 scripts/install-test/vm.py start

# Install only built and operator-gated fixture payload into owned guest.
python3 scripts/install-test/vm.py copy "$release"
archive="$(basename "$release")"
package="${archive%.tar.gz}"
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

# G3 read-only guest fact check: the installed systemd services must refer
# to real owned binaries under /opt/gpupanel. /usr/local/bin binaries are
# lookup-only compatibility symlinks, never in-app upgrade write targets.
# This does not perform or certify A→B→A upgrade or rollback.
if ! python3 scripts/install-test/vm.py ssh -- sudo sh -euc '
  [ "$(readlink -f /opt/gpupanel)" = /opt/gpupanel ]
  for role in core agent; do
    binary="/opt/gpupanel/gpupanel-$role"
    alias="/usr/local/bin/gpupanel-$role"
    unit="/etc/systemd/system/gpupanel-$role.service"
    [ -f "$binary" ] && [ -x "$binary" ] && [ ! -L "$binary" ]
    [ -L "$alias" ] && [ "$(readlink "$alias")" = "$binary" ]
    [ -f "$unit" ] && [ ! -L "$unit" ]
    [ "$(grep -Fxc "ExecStart=$binary" "$unit")" = 1 ]
    [ "$(grep -Fxc "WorkingDirectory=/opt/gpupanel" "$unit")" = 1 ]
  done
' > "$STATE/upgrade-runtime-identity.raw.log" 2>&1; then
  echo 'BLOCKED: installed guest runtime ownership differs from reviewed systemd layout' >&2
  exit 3
fi
echo 'G3 real guest runtime identity checked (read-only); upgrade/rollback NOT_RUN'

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

# A successful run is a G3 fresh-install + G4 slice + G6 Agent slice only.
# G5 real AppInstall, upgrade/rollback and full data restore stay NOT RUN.
echo 'LIVE VM partial acceptance PASSED; M0 release decision remains NO_GO'
