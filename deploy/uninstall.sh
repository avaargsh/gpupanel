#!/usr/bin/env bash
#
# GPUPanel service teardown.
#
# Usage:
#   sudo uninstall.sh [--base-dir DIR] [--purge --confirm-purge DIR]
#
# By default, only the verified GPUPanel systemd integration is removed. The
# complete installation directory, binaries, configuration and user data are
# retained so a later recovery is possible. Purge is a separate explicit action.
set -euo pipefail

BASE_DIR="/opt"
PURGE=0
CONFIRM_PURGE=""

die() {
    printf 'GPUPanel uninstall refused/failed: %s\n' "$*" >&2
    exit 1
}

while [ $# -gt 0 ]; do
    case "$1" in
        --base-dir)
            [ $# -ge 2 ] || die "--base-dir requires a path"
            BASE_DIR="$2"
            shift 2
            ;;
        --purge)
            PURGE=1
            shift
            ;;
        --confirm-purge)
            [ $# -ge 2 ] || die "--confirm-purge requires the exact installation path"
            CONFIRM_PURGE="$2"
            shift 2
            ;;
        -h|--help)
            sed -n '2,/^[^#]/p' "$0" | sed -e 's/^# \{0,1\}//' | head -n -1
            exit 0
            ;;
        *)
            die "unknown argument: $1"
            ;;
    esac
done

[ -n "$BASE_DIR" ] || die "--base-dir needs a value"
case "$BASE_DIR" in
    /*) ;;
    *) die "--base-dir must be an absolute path (got: $BASE_DIR)" ;;
esac
BASE_DIR="${BASE_DIR%/}"
[ -n "$BASE_DIR" ] || die "refuse the filesystem root as base-dir"

[ "$(id -u)" = "0" ] || die "uninstall.sh must run as root"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PREFLIGHT="$SCRIPT_DIR/gpupanel-uninstall-preflight.py"
if [ ! -f "$PREFLIGHT" ] || [ -L "$PREFLIGHT" ]; then
    PREFLIGHT="$SCRIPT_DIR/../scripts/gpupanel-uninstall-preflight.py"
fi
[ -f "$PREFLIGHT" ] && [ ! -L "$PREFLIGHT" ] || die "missing safe uninstall preflight helper"
command -v python3 >/dev/null 2>&1 || die "Python 3 is required for uninstall preflight"

PANEL_DIR="$BASE_DIR/gpupanel"
UNIT_DIR="/etc/systemd/system"
SYSTEMD_ARGS=(--no-systemd)
if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
    SYSTEMD_ARGS=(--systemd)
fi
PREFLIGHT_ARGS=(--base-dir "$BASE_DIR" --unit-dir "$UNIT_DIR" "${SYSTEMD_ARGS[@]}")
if [ "$PURGE" = "1" ]; then
    PREFLIGHT_ARGS+=(--purge --confirm-purge "$CONFIRM_PURGE")
elif [ -n "$CONFIRM_PURGE" ]; then
    die "--confirm-purge is valid only with --purge"
fi

# Read-only plan: prove the target and each systemd unit belong to this install
# before sending stop/disable commands or deleting any unit/data.
PLAN="$(python3 "$PREFLIGHT" "${PREFLIGHT_ARGS[@]}")" || die "ownership/path preflight failed; no changes were requested"
printf 'Verified GPUPanel uninstall plan: %s\n' "$PLAN"

if [ "${SYSTEMD_ARGS[0]}" = "--systemd" ]; then
    if ! systemctl disable --now gpupanel-agent.service gpupanel-core.service; then
        die "systemd did not confirm stop/disable; unit files and installation directory retained"
    fi
    for service in gpupanel-agent.service gpupanel-core.service; do
        if systemctl is-active --quiet "$service"; then
            die "$service is still active; refusing to remove its unit or installation directory"
        fi
    done
fi

# This second read-only check catches manual nohup processes and stop races.
python3 "$PREFLIGHT" --base-dir "$BASE_DIR" --unit-dir "$UNIT_DIR" "${SYSTEMD_ARGS[@]}" --assert-stopped >/dev/null \
    || die "a GPUPanel process is still running or ownership changed; no files were removed"

# The preflight proved these are exact regular files for this installation.
# Do not kill by process name or command-line substring.
rm -f -- "$UNIT_DIR/gpupanel-core.service" "$UNIT_DIR/gpupanel-agent.service"
if [ "${SYSTEMD_ARGS[0]}" = "--systemd" ]; then
    systemctl daemon-reload || die "systemd daemon-reload failed; installation data was retained"
fi

if [ "$PURGE" = "1" ]; then
    # Re-check ownership and mount-point state after stopping services and
    # removing unit files, before the only recursive deletion in this script.
    python3 "$PREFLIGHT" --base-dir "$BASE_DIR" --unit-dir "$UNIT_DIR" --no-systemd \
        --units-removed --purge --confirm-purge "$PANEL_DIR" >/dev/null \
        || die "final purge guard failed; installation directory retained"
    rm -rf --one-file-system -- "$PANEL_DIR"
    printf 'GPUPanel installation directory and its data were purged: %s\n' "$PANEL_DIR"
else
    printf 'GPUPanel systemd units removed; the installation directory is retained: %s\n' "$PANEL_DIR"
    printf 'Binaries, configuration, database and user data remain for recovery. This is not a full package purge.\n'
    printf 'To permanently delete it, rerun with --purge --confirm-purge %s\n' "$PANEL_DIR"
fi
