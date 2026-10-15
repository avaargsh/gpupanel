#!/usr/bin/env bash
#
# GPUPanel uninstaller.
#
#   sudo uninstall.sh [--base-dir DIR] [--purge]
#
# By default the panel data under <base-dir>/gpupanel is kept. Pass --purge to
# delete it as well.
set -euo pipefail

BASE_DIR="/opt"
PURGE=0

while [ $# -gt 0 ]; do
    case "$1" in
        --base-dir) BASE_DIR="${2:-}"; shift 2 ;;
        --purge) PURGE=1; shift ;;
        -h|--help) sed -n '2,/^[^#]/p' "$0" | sed -e 's/^# \{0,1\}//' | head -n -1; exit 0 ;;
        *) echo "unknown argument: $1" >&2; exit 1 ;;
    esac
done

[ -n "$BASE_DIR" ] || { echo "--base-dir needs a value" >&2; exit 1; }
case "$BASE_DIR" in /*) ;; *) echo "--base-dir must be an absolute path (got: $BASE_DIR)" >&2; exit 1 ;; esac
BASE_DIR="${BASE_DIR%/}"

if [ "$(id -u)" != "0" ]; then
    echo "uninstall.sh must run as root (try: sudo $0 $*)" >&2
    exit 1
fi

PANEL_DIR="${BASE_DIR}/gpupanel"
BIN_DIR="/usr/local/bin"
UNIT_DIR="/etc/systemd/system"

echo "==> stopping GPUPanel"
if command -v systemctl >/dev/null 2>&1; then
    systemctl disable --now gpupanel-agent gpupanel-core 2>/dev/null || true
fi
# Never let one stubborn file abort the uninstall half-way and leave the
# services and symlinks behind.
rm -f "$UNIT_DIR/gpupanel-core.service" "$UNIT_DIR/gpupanel-agent.service" 2>/dev/null \
    || echo "    warning: could not remove the unit files from $UNIT_DIR"
if command -v systemctl >/dev/null 2>&1; then
    systemctl daemon-reload 2>/dev/null || true
    systemctl reset-failed 2>/dev/null || true
fi
pkill -x gpupanel-agent 2>/dev/null || true
pkill -x gpupanel-core 2>/dev/null || true
pkill -f "$PANEL_DIR/gpupanel-agent" 2>/dev/null || true
pkill -f "$PANEL_DIR/gpupanel-core" 2>/dev/null || true
sleep 1

echo "==> removing symlinks from $BIN_DIR"
# Only remove the links when they still point into the panel dir, so a
# differently-installed GPUPanel is never clobbered by this uninstaller.
for link in pctl gpupanel-core gpupanel-agent; do
    target="$(readlink -f "$BIN_DIR/$link" 2>/dev/null || true)"
    case "$target" in
        "$PANEL_DIR"/*) rm -f "$BIN_DIR/$link"; echo "    removed $BIN_DIR/$link" ;;
        "") : ;;
        *) echo "    kept $BIN_DIR/$link -> $target (not part of $PANEL_DIR)" ;;
    esac
done

if [ "$PURGE" = "1" ]; then
    echo "==> purging $PANEL_DIR"
    rm -rf "$PANEL_DIR"
else
    echo "==> keeping $PANEL_DIR (pass --purge to remove)"
fi

echo "GPUPanel uninstalled."
echo "  note: /usr/local/bin/lang is shared with the in-app upgrade path and is left in place."