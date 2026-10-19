#!/usr/bin/env bash
#
# GPUPanel installer. Installs the panel under ${BASE_DIR}/gpupanel (default
# /opt/gpupanel) and runs it with systemd (falling back to pctl/nohup).
#
# Usage:
#   sudo install.sh [--base-dir DIR] [--payload DIR] [--port N] [--username NAME]
#                   [--password PASS] [--entrance PATH] [--language CODE]
#                   [--no-systemd] [--skip-config] [--bind-address 127.0.0.1|0.0.0.0]
#                   [--experimental-ubuntu-26] [--no-auto-provision]
#                   [--approve-disposable-vm-install]
#
# Without explicit disposable-VM acceptance, this installer exits BEFORE
# running any artifact-supplied code. Run preflight separately as non-root.
# This is a laboratory override, never production release approval.
#
# Self-contained: works from a source checkout (deploy/install.sh) and from an
# extracted release tarball (gpupanel-<version>-<os>-<arch>/install.sh).
#
# Everything the Go binaries read at boot comes from the KEY=VALUE header of
# pctl, resolved through /usr/local/bin/pctl (core/utils/ctl_conf). This script
# therefore stamps BASE_DIR, ORIGINAL_PORT, ORIGINAL_USERNAME,
# ORIGINAL_PASSWORD, ORIGINAL_ENTRANCE, ORIGINAL_VERSION and LANGUAGE there --
# the same contract the in-app upgrade path (core/app/service/upgrade.go)
# relies on when it re-copies a new pctl over the installed one.
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[0;33m'; BLUE=$'\033[0;34m'; NC=$'\033[0m'
# No payload/source writes before argument and collision validation.
LOG_FILE=""
LOG_READY=0
log() {
    if [ "$LOG_READY" = "1" ]; then
        printf '%s\n' "$*" | tee -a "$LOG_FILE"
    else
        printf '%s\n' "$*"
    fi
}
init_install_log() {
    LOG_FILE="$PANEL_DIR/log/install.log"
    [ ! -L "$PANEL_DIR" ] && [ ! -L "$PANEL_DIR/log" ] && [ ! -L "$LOG_FILE" ] \
        || die "refuse symlinked installation log path"
    mkdir -p "$PANEL_DIR/log"
    [ ! -L "$PANEL_DIR/log" ] && [ ! -L "$LOG_FILE" ] \
        || die "refuse redirected installation log"
    : >> "$LOG_FILE"
    chmod 0600 "$LOG_FILE"
    LOG_READY=1
}
info() { log "$(printf '%b' "${BLUE}[GPUPanel]${NC} $*")"; }
ok()   { log "$(printf '%b' "${GREEN}[GPUPanel]${NC} $*")"; }
warn() { log "$(printf '%b' "${YELLOW}[GPUPanel]${NC} $*")"; }
die()  { log "$(printf '%b' "${RED}[GPUPanel]${NC} $*")"; exit 1; }

banner() {
    cat <<'EOF' | tee -a "$LOG_FILE"
   ____  ____  _    _ ____             __    _
  / ___|/ ___|| |_ (_)  _ \   _  __ _  / /__ (_)_ __   ___
 | |  _| |  _|  _| | | | | | | |/ _` |/ _ \| | '_ \ / __|
 | |_| | |_| | | | | |_| | |_| | (_| |  __/ | | | | \__ \
  \____|____/_| |_|\___/|_|  \__,_|\___|_|\___|_|_| |_||___/
EOF
}

# Print the header comment block (everything from line 2 up to the first
# non-comment line), so --help never drifts out of sync with the header.
usage() {
    sed -n '2,/^[^#]/p' "$0" | sed -e 's/^# \{0,1\}//' | head -n -1
}

# ---- options -----------------------------------------------------------------
BASE_DIR="/opt"
PAYLOAD=""
PORT=""
USERNAME=""
PASSWORD=""
ENTRANCE=""
LANGUAGE=""
USE_SYSTEMD=1
SKIP_CONFIG=0
# G3 is a personal workstation / disposable VM pilot. Remote unauthenticated
# HTTP access is not an acceptable implicit installation default.
BIND_ADDRESS="127.0.0.1"
AUTO_PROVISION=enabled
APPROVE_DISPOSABLE_VM_INSTALL=0
EXPLICIT_PAYLOAD=0
PREFLIGHT_ARGS=()

while [ $# -gt 0 ]; do
    case "$1" in
        --no-auto-provision) AUTO_PROVISION=disabled; shift ;;
        --approve-disposable-vm-install) APPROVE_DISPOSABLE_VM_INSTALL=1; shift ;;
        --bind-address) BIND_ADDRESS="${2:-}"; shift 2 ;;
        --experimental-ubuntu-26) PREFLIGHT_ARGS+=(--experimental-ubuntu-26); shift ;;
        --base-dir)  BASE_DIR="${2:-}"; shift 2 ;;
        --payload)   PAYLOAD="${2:-}"; EXPLICIT_PAYLOAD=1; shift 2 ;;
        --port)      PORT="${2:-}"; shift 2 ;;
        --username)  USERNAME="${2:-}"; shift 2 ;;
        --password)  PASSWORD="${2:-}"; shift 2 ;;
        --entrance)  ENTRANCE="${2:-}"; shift 2 ;;
        --language)  LANGUAGE="${2:-}"; shift 2 ;;
        --no-systemd) USE_SYSTEMD=0; shift ;;
        --skip-config) SKIP_CONFIG=1; shift ;;
        -h|--help) usage; exit 0 ;;
        *) die "unknown argument: $1" ;;
    esac
done

case "$BIND_ADDRESS" in 127.0.0.1|0.0.0.0) ;; *) die "--bind-address must be 127.0.0.1 or 0.0.0.0" ;; esac
[ -n "$BASE_DIR" ] || die "--base-dir needs a value"
case "$BASE_DIR" in
    /*) ;;
    *) die "--base-dir must be an absolute path (got: $BASE_DIR)" ;;
esac
BASE_DIR="${BASE_DIR%/}"
[ -n "$BASE_DIR" ] || die "refuse the filesystem root as installation base-dir"

# The payload may contain a Python checker. Never execute package-controlled
# code as root merely because a caller tried the install command without
# authorizing a disposable VM. A separate non-root preflight invocation is
# the diagnostic entrypoint, NOT install.sh's default behavior.
[ "$APPROVE_DISPOSABLE_VM_INSTALL" = "1" ] || die "GPUPanel install authorization denied before running any payload or preflight code. First run the read-only GPUPanel preflight separately as a normal user; only use --approve-disposable-vm-install on an isolated, snapshotted Ubuntu 24.04 test VM."

[ "$(id -u)" = "0" ] || die "install.sh must run as root (try: sudo $0 $*)"

if [ "$AUTO_PROVISION" = "disabled" ]; then
    [ "$USE_SYSTEMD" = "1" ] && [ -d /run/systemd/system ] || die "--no-auto-provision requires systemd"
fi
export GPUPANEL_AUTO_PROVISION="$AUTO_PROVISION"
PANEL_DIR="${BASE_DIR}/gpupanel"
CONF_DIR="${PANEL_DIR}/conf"
GEO_DIR="${PANEL_DIR}/geo"
BIN_DIR="/usr/local/bin"
UNIT_DIR="/etc/systemd/system"

# ---- locate payload ----------------------------------------------------------
# 1. an explicit --payload
# 2. this script's own directory (extracted tarball, or a flattened payload)
# 3. the newest build/release/gpupanel-* from a source checkout
# 4. the raw build/ binaries from a source checkout
[ "$EXPLICIT_PAYLOAD" = "0" ] || [ -n "$PAYLOAD" ] || die "--payload requires a non-empty directory"
# Full release payloads are atomic: never silently use repo fallbacks when
# their required files are absent. Only implicit raw build/ source mode may
# combine locally compiled binaries with source-controlled config/units.
SOURCE_BUILD_MODE=0
if [ -z "$PAYLOAD" ]; then
    if [ -f "$SCRIPT_DIR/gpupanel-core" ]; then
        PAYLOAD="$SCRIPT_DIR"
    else
        _cand="$(ls -1dt "$ROOT"/build/release/gpupanel-* 2>/dev/null | head -n 1 || true)"
        if [ -n "$_cand" ] && [ -f "$_cand/gpupanel-core" ]; then
            PAYLOAD="$_cand"
        elif [ -f "$ROOT/build/gpupanel-core" ]; then
            PAYLOAD="$ROOT/build"
            SOURCE_BUILD_MODE=1
        fi
    fi
fi
[ -n "$PAYLOAD" ] || die "no release payload found; pass --payload DIR or run deploy/build.sh first"

# A supplied or auto-discovered release must be complete and not symlinked.
# Otherwise pick() would splice release binaries together with unrelated
# source-checkout pctl, units and Python preflight (a provenance violation).
if [ "$SOURCE_BUILD_MODE" = "0" ]; then
    [ -d "$PAYLOAD" ] && [ ! -L "$PAYLOAD" ] || die "release payload directory must be an ordinary directory"
    [ ! -L "$PAYLOAD/initscript" ] || die "release unit directory must not be a symlink"
    for rel in gpupanel-core gpupanel-agent pctl app.yaml gpupanel-install-preflight.py \
               initscript/gpupanel-core.service initscript/gpupanel-agent.service; do
        [ -f "$PAYLOAD/$rel" ] && [ ! -L "$PAYLOAD/$rel" ] \
            || die "incomplete or redirected release payload: $rel"
    done
fi

# Source fallback is allowed only for an *implicit* raw source build. A
# complete release never falls back to another checkout or package.
pick() {
    if [ "$SOURCE_BUILD_MODE" = "0" ]; then
        printf '%s\n' "$PAYLOAD/$1"
    elif [ -f "$PAYLOAD/$1" ]; then
        printf '%s\n' "$PAYLOAD/$1"
    else
        printf '%s\n' "$2"
    fi
}

CORE_SRC="$(pick gpupanel-core "$ROOT/build/gpupanel-core")"
AGENT_SRC="$(pick gpupanel-agent "$ROOT/build/gpupanel-agent")"
PCTL_SRC="$(pick pctl "$SCRIPT_DIR/pctl")"
CONF_SRC="$(pick app.yaml "$SCRIPT_DIR/conf/app.yaml")"

# Units live in initscript/ inside a release payload (that is where the in-app
# upgrade expects them) and in systemd/ inside a source checkout.
UNIT_CORE_SRC="$(pick initscript/gpupanel-core.service "")"
[ -n "$UNIT_CORE_SRC" ] || UNIT_CORE_SRC="$(pick gpupanel-core.service "$SCRIPT_DIR/systemd/gpupanel-core.service")"
UNIT_AGENT_SRC="$(pick initscript/gpupanel-agent.service "")"
[ -n "$UNIT_AGENT_SRC" ] || UNIT_AGENT_SRC="$(pick gpupanel-agent.service "$SCRIPT_DIR/systemd/gpupanel-agent.service")"

for f in "$CORE_SRC" "$AGENT_SRC" "$PCTL_SRC" "$CONF_SRC" "$UNIT_CORE_SRC" "$UNIT_AGENT_SRC"; do
    [ -f "$f" ] || die "missing required file: $f (pass --payload DIR)"
done

# ---- helpers -----------------------------------------------------------------
# Hex secrets only: no SIGPIPE-prone pipe (a plain `tr | head` under
# `set -o pipefail` makes the installer die with 141), and a charset that stays
# a valid bash assignment and sed replacement once stamped into pctl.
gen_hex() {
    od -An -tx1 -N "$(( $1 / 2 ))" /dev/urandom | tr -d ' \n'
}

# Print the value of KEY= in file $1 (empty when absent).
read_kv() {
    [ -f "$1" ] || return 0
    sed -n "s|^$2=||p" "$1" | head -n 1
}

# Set KEY= in file $1 to value $2, keeping the KEY=VALUE header valid for both
# bash (pctl is a script) and the Go parser (prefix match).
upsert_kv() {
    local file="$1" key="$2" value="$3" escaped
    escaped="$(printf '%s' "$value" | sed -e 's/[\\&|]/\\&/g')"
    if grep -q "^${key}=" "$file"; then
        sed -i "s|^${key}=.*|${key}=${escaped}|" "$file"
    else
        printf '%s=%s\n' "$key" "$value" >> "$file"
    fi
}

port_listening() {
    if command -v ss >/dev/null 2>&1; then
        ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$1\$"
    elif command -v netstat >/dev/null 2>&1; then
        netstat -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$1\$"
    else
        (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && exec 3>&- && return 0
        return 1
    fi
}

firewall_open() {
    if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld 2>/dev/null; then
        firewall-cmd --zone=public --add-port="$1"/tcp --permanent >/dev/null 2>&1 && firewall-cmd --reload >/dev/null 2>&1
        return 0
    fi
    if command -v ufw >/dev/null 2>&1 && systemctl is-active --quiet ufw 2>/dev/null; then
        ufw allow "$1"/tcp >/dev/null 2>&1
        return 0
    fi
    return 1
}

detect_ip() {
    local iface
    iface="$(ip route get 8.8.8.8 2>/dev/null | awk 'NR==1 {print $5}')"
    if [ -n "$iface" ]; then
        ip -4 addr show dev "$iface" 2>/dev/null | grep -oE 'inet [0-9]+(\.[0-9]+){3}' | awk '{print $2}' | head -n 1
    fi
}

# Refuse legacy/current installations and redirected parents before host mutation.
PREFLIGHT="$(pick gpupanel-install-preflight.py "$ROOT/scripts/gpupanel-install-preflight.py")"
[ -f "$PREFLIGHT" ] || die "missing reviewed collision preflight"
command -v python3 >/dev/null || die "Python 3 is required for read-only preflight"
# The explicitly approved VM path still must validate the complete
# conservative diagnostic JSON before writing to any host path. Exit 0 alone
# is never sufficient; required BLOCKED/UNKNOWN cannot be overridden.
PREFLIGHT_JSON="$(python3 "$PREFLIGHT" --json "${PREFLIGHT_ARGS[@]}")" || die "preflight blocked; installation was not started"
printf '%s\n' "$PREFLIGHT_JSON"
GPUPANEL_PREFLIGHT_JSON="$PREFLIGHT_JSON" python3 - "$APPROVE_DISPOSABLE_VM_INSTALL" <<'PY_INSTALL_APPROVAL' || die "GPUPanel install authorization denied; no host mutation"
import json
import os
import sys

def deny(reason):
    raise SystemExit("GPUPanel install denied: " + reason)

try:
    report = json.loads(os.environ["GPUPANEL_PREFLIGHT_JSON"])
    if not isinstance(report, dict) or report.get("product") != "GPUPanel" or report.get("phase") != "pre-install-diagnostics-only":
        deny("unrecognized preflight report")
    if report.get("installable") is not False or report.get("safe_to_install") is not False:
        deny("preflight diagnosis was incorrectly presented as installation approval")
    checks = report["checks"]
    blockers = report["blockers"]
    if not isinstance(checks, list) or not isinstance(blockers, list) or blockers:
        deny("blocked or malformed diagnostic result")
    states = {}
    for item in checks:
        if not isinstance(item, dict) or not isinstance(item.get("code"), str) or item.get("state") not in ("PASS", "BLOCKED", "UNKNOWN"):
            deny("malformed safety check")
        if item["code"] in states:
            deny("duplicate safety check")
        states[item["code"]] = item
    if any(item["state"] == "BLOCKED" for item in checks):
        deny("blocked safety check without consistent blockers list")
    # No unsupported OS, experimental 26.04, unknown capacity or collision
    # ambiguity may silently become an installer PASS.
    required = ("operating_system", "runtime_collision", "runtime_path_symlink", "disk_space")
    if any(states.get(code, {}).get("state") != "PASS" for code in required):
        deny("OS/collision/disk checks are not all PASS")
    if states["operating_system"].get("detail") != "Ubuntu 24.04":
        deny("only a disposable Ubuntu 24.04 VM is in scope")
    # Future scanners may add strong collision checks. If present, a definite
    # BLOCKED result is rejected above; UNKNOWN remains diagnostic, not proof.
    if sys.argv[1] != "1":
        deny("provide --approve-disposable-vm-install after independently verifying VM isolation, ownership and rollback")
except (ValueError, KeyError, TypeError) as exc:
    deny("invalid preflight JSON or missing safety fields")
PY_INSTALL_APPROVAL
python3 - "$BASE_DIR" <<'PYCODE'
import pathlib, sys
base = pathlib.Path(sys.argv[1])
for parent in (base, *base.parents):
    if parent.is_symlink():
        raise SystemExit("refuse symlinked installation parent")
target = base / "gpupanel"
if target.exists() or target.is_symlink():
    raise SystemExit("existing GPUPanel installation: backup/migration review required")
PYCODE

# ---- carry over an existing installation -------------------------------------
# Re-running the installer (or upgrading) must not silently rotate the
# credentials the panel already stored in its database.
OLD_PCTL="$PANEL_DIR/pctl"
[ -f "$OLD_PCTL" ] || OLD_PCTL="$BIN_DIR/pctl"

# A non-empty db means the panel has already booted and owns its credentials:
# from here on they live in its database, not in pctl.
REINSTALL=0
if [ -d "$PANEL_DIR/db" ] && [ -n "$(ls -A "$PANEL_DIR/db" 2>/dev/null)" ]; then
    REINSTALL=1
fi

old_port="$(read_kv "$OLD_PCTL" ORIGINAL_PORT)"
old_user="$(read_kv "$OLD_PCTL" ORIGINAL_USERNAME)"
old_pass="$(read_kv "$OLD_PCTL" ORIGINAL_PASSWORD)"
old_entrance="$(read_kv "$OLD_PCTL" ORIGINAL_ENTRANCE)"
old_lang="$(read_kv "$OLD_PCTL" LANGUAGE)"
old_version="$(read_kv "$OLD_PCTL" ORIGINAL_VERSION)"

PORT="${PORT:-${old_port:-9999}}"
USERNAME="${USERNAME:-${old_user:-admin}}"
PASSWORD="${PASSWORD:-${old_pass:-}}"
ENTRANCE="${ENTRANCE:-${old_entrance:-}}"
LANGUAGE="${LANGUAGE:-${old_lang:-zh}}"

PORT="${PORT:-9999}"
USERNAME="${USERNAME:-admin}"
LANGUAGE="${LANGUAGE:-zh}"
[ "$PORT" -ge 1 ] 2>/dev/null && [ "$PORT" -le 65535 ] 2>/dev/null \
    || die "invalid port: $PORT (expected 1-65535)"

port_listening "$PORT" && die "port $PORT is already in use; no process was stopped"

if [ "$REINSTALL" = "1" ]; then
    # Keep whatever the previous install recorded. Rotating it here would hand
    # out a password the panel does not accept, since the live credentials are
    # now in its database.
    PASSWORD="${PASSWORD:-$old_pass}"
    PASSWORD_KNOWN=0
    case "$PASSWORD" in
        ""|"**********") PASSWORD="**********"; PASSWORD_KNOWN=0 ;;
        *)               PASSWORD_KNOWN=1 ;;
    esac
    [ -n "$PASSWORD" ] || PASSWORD="**********"
else
    # The core masks ORIGINAL_PASSWORD once it has seeded its database; on a
    # fresh install a mask or empty value means "no password recorded yet".
    case "$PASSWORD" in
        ""|"**********") PASSWORD="" ;;
    esac
    if [ -z "$PASSWORD" ]; then
        PASSWORD="$(gen_hex 16)"
        PASSWORD_KNOWN=1
        info "generated a random panel password"
    else
        PASSWORD_KNOWN=1
    fi
fi
# ORIGINAL_ENTRANCE must never be empty: core/init/viper panics on an empty
# value instead of falling back to "/".
[ -n "$ENTRANCE" ] || ENTRANCE="$(gen_hex 10)"
ENTRANCE="${ENTRANCE#/}"
case "$ENTRANCE" in
    *[!A-Za-z0-9_-]*|"") die "invalid entrance (use 3-30 chars of A-Za-z0-9_-; input omitted)" ;;
esac

# pctl is both a bash script and a KEY=VALUE file read by the Go binaries, so a
# value containing whitespace, quotes or a backslash would break one of the two
# readers (or the sed that writes it).
assert_kv_safe() {
    case "$2" in
        *[[:space:]]*) die "$1 may not contain whitespace (input omitted)" ;;
        *"'"*|*'"'*|*"\\"*|*"$"*|*"\`"*|*";"*|*"&"*|*"|"*|*"("*|*")"*|*"<"*|*">"*)
            die "$1 may not contain quotes or shell metacharacters (input omitted)" ;;
    esac
}
assert_kv_safe BASE_DIR "$BASE_DIR"
assert_kv_safe USERNAME "$USERNAME"
assert_kv_safe LANGUAGE  "$LANGUAGE"
assert_kv_safe PASSWORD  "$PASSWORD"

VERSION="$(read_kv "$PCTL_SRC" ORIGINAL_VERSION)"
[ -n "$VERSION" ] || VERSION="${old_version:-v0.1.0}"

# First durable write is after read-only preflight and secret-safe validation.
init_install_log
banner
info "installing GPUPanel $VERSION to $PANEL_DIR"
[ -n "$PAYLOAD" ] && info "payload: $PAYLOAD"

# Fresh install only: preflight rejects existing units/state. Never use pkill to
# stop unrelated binaries or test processes whose arguments contain our name.
# ---- install binary + script ------------------------------------------------
mkdir -p "$PANEL_DIR" "$CONF_DIR" "$PANEL_DIR/log" "$PANEL_DIR/db" "$GEO_DIR"
install -m 0755 "$CORE_SRC" "$PANEL_DIR/gpupanel-core"
install -m 0755 "$AGENT_SRC" "$PANEL_DIR/gpupanel-agent"

# pctl must live at /usr/local/bin/pctl because the Go binaries read their
# ORIGINAL_* / BASE_DIR / LANGUAGE keys from that exact path. Keep the real
# script under $PANEL_DIR and expose it through a symlink.
install -m 0700 "$PCTL_SRC" "$PANEL_DIR/pctl"
ln -sfn "$PANEL_DIR/pctl" "$BIN_DIR/pctl"
# compatibility links for the in-app upgrade/restore code paths, which copy the
# new binaries straight into /usr/local/bin
ln -sfn "$PANEL_DIR/gpupanel-core" "$BIN_DIR/gpupanel-core"
ln -sfn "$PANEL_DIR/gpupanel-agent" "$BIN_DIR/gpupanel-agent"
if [ -f "$PAYLOAD/GeoIP.mmdb" ]; then
    install -m 0644 "$PAYLOAD/GeoIP.mmdb" "$GEO_DIR/GeoIP.mmdb"
fi

# ---- stamp the pctl header --------------------------------------------------
# This is the whole boot contract: without every one of these keys the core
# panics at startup (ctl_conf.Load) or comes up with the placeholder password.
upsert_kv "$PANEL_DIR/pctl" BASE_DIR          "$BASE_DIR"
upsert_kv "$PANEL_DIR/pctl" ORIGINAL_PORT     "$PORT"
upsert_kv "$PANEL_DIR/pctl" ORIGINAL_BIND_ADDRESS "$BIND_ADDRESS"
upsert_kv "$PANEL_DIR/pctl" ORIGINAL_USERNAME "$USERNAME"
upsert_kv "$PANEL_DIR/pctl" ORIGINAL_PASSWORD "$PASSWORD"
upsert_kv "$PANEL_DIR/pctl" ORIGINAL_ENTRANCE "$ENTRANCE"
upsert_kv "$PANEL_DIR/pctl" ORIGINAL_VERSION  "$VERSION"
upsert_kv "$PANEL_DIR/pctl" LANGUAGE          "$LANGUAGE"
upsert_kv "$PANEL_DIR/pctl" PANEL_EDITION     "${PANEL_EDITION:-cn}"
# drop a stale CHANGE_USER_INFO left over from an interrupted install, otherwise
# the core would reset the credentials we just installed
sed -i '/^CHANGE_USER_INFO=/d' "$PANEL_DIR/pctl"
ok "pctl configured (BASE_DIR=$BASE_DIR ORIGINAL_PORT=$PORT ORIGINAL_ENTRANCE=$ENTRANCE)"

# ---- install config ---------------------------------------------------------
if [ "$SKIP_CONFIG" = "1" ]; then
    info "config: skipped (--skip-config)"
else
    # base.port stays a bare int, conn.port stays a quoted string: Conn.Port is a
    # string field, and a bare 9999 would fail to decode in dev mode. The first
    # pattern only touches the unquoted form, so the two do not collide.
    sed -e "s|^\(  install_dir:\).*|\1 ${BASE_DIR}|" \
        -e "s|^\(  mode:\).*|\1 release|" \
        -e "s|^\(  username:\).*|\1 ${USERNAME}|" \
        -e "s|^\(  password:\).*|\1 ${PASSWORD}|" \
        -e "s|^\(  version:\).*|\1 ${VERSION}|" \
        -e "s|^\(  entrance:\).*|\1 ${ENTRANCE}|" \
        -e "s|^  port: [^\\\"]*$|  port: ${PORT}|" \
        -e "s|^  port: \\\".*|  port: \\\"${PORT}\\\"|" \
        "$CONF_SRC" > "$CONF_DIR/app.yaml"
    chmod 0600 "$CONF_DIR/app.yaml"
    ok "config: wrote $CONF_DIR/app.yaml"
fi
# Note: in release mode the core reads its settings from pctl and the embedded
# app.yaml, not from this file. It only takes effect if `mode: dev` is set
# manually, which is what the `make dev` workflow does.

# ---- systemd units ----------------------------------------------------------
started=0
if [ "$USE_SYSTEMD" = "1" ] && command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
    # A service manager that cannot even reload still leaves the pctl/nohup
    # fallback usable, so never abort on it.
    for src in "$UNIT_CORE_SRC" "$UNIT_AGENT_SRC"; do
        name="$(basename "$src")"
        sed -e "s|/opt/gpupanel|${PANEL_DIR}|g" "$src" > "$UNIT_DIR/$name"
        if [ "$name" = "gpupanel-agent.service" ]; then
            sed -i "/^\[Service\]/a Environment=GPUPANEL_AUTO_PROVISION=$AUTO_PROVISION" "$UNIT_DIR/$name"
        fi
        chmod 0644 "$UNIT_DIR/$name"
    done
    systemctl daemon-reload 2>/dev/null || warn "systemctl daemon-reload failed"
    systemctl enable gpupanel-core gpupanel-agent >/dev/null 2>&1 || true
    if systemctl restart gpupanel-core && systemctl restart gpupanel-agent; then
        ok "systemd units installed and started"
        started=1
    else
        warn "systemd could not start the services, falling back to pctl"
    fi
fi

if [ "$started" = "0" ]; then
    info "starting via pctl"
    # Do not abort here: a failed start still deserves the readiness report and
    # the log tail further down.
    "$PANEL_DIR/pctl" start || warn "pctl start reported a failure"
fi

# ---- wait for the panel to actually serve ------------------------------------
# systemctl restart returns as soon as the unit is spawned, so a core that
# panics on a missing pctl key (or a stale unit left by an older install) still
# counts as "started". Poll the listening port instead.
wait_ready() {
    local tries="$1"
    while [ "$tries" -gt 0 ]; do
        port_listening "$PORT" && python3 "$PREFLIGHT" --agent-health && return 0
        sleep 2
        tries=$((tries - 1))
    done
    return 1
}

report_failure() {
    warn "Core port $PORT or private Agent health check is not ready"
    if command -v systemctl >/dev/null 2>&1 && [ "$USE_SYSTEMD" = "1" ]; then
        systemctl --no-pager --lines 20 status gpupanel-core gpupanel-agent 2>&1 | tee -a "$LOG_FILE" || true
    fi
    for lf in "$PANEL_DIR/log"/*.log "$PANEL_DIR/log"/*.out; do
        [ -f "$lf" ] || continue
        warn "last lines of $lf:"
        tail -n 20 "$lf" 2>&1 | tee -a "$LOG_FILE" || true
    done
    die "GPUPanel did not come up; see $LOG_FILE"
}

info "waiting for Core port $PORT and private Agent health"
if wait_ready 30; then
    :
elif [ "$started" = "1" ]; then
    # systemd accepted the units but nothing came up: a stale or broken unit can
    # report success while crash-looping. Retry the way pctl does with nohup.
    warn "systemd accepted the units but the panel is not answering; retrying without systemd"
    systemctl stop gpupanel-agent gpupanel-core 2>/dev/null || true
    nohup "$PANEL_DIR/gpupanel-agent" >>"$PANEL_DIR/log/gpupanel-agent.out" 2>&1 &
    nohup "$PANEL_DIR/gpupanel-core" >>"$PANEL_DIR/log/gpupanel-core.out" 2>&1 &
    if wait_ready 15; then
        ok "panel is up (nohup fallback)"
    else
        report_failure
    fi
else
    report_failure
fi

if [ "$BIND_ADDRESS" = "127.0.0.1" ]; then
    info "loopback-only binding; firewall unchanged"
elif firewall_open "$PORT"; then
    ok "firewall: opened $PORT/tcp"
else
    info "firewall: none active (open $PORT/tcp yourself if the panel is unreachable)"
fi

# ---- summary ----------------------------------------------------------------
LOCAL_IP="$(detect_ip || true)"
PUBLIC_IP=""
if [ "$BIND_ADDRESS" != "127.0.0.1" ] && command -v curl >/dev/null 2>&1; then
    PUBLIC_IP="$(curl -fsS --max-time 5 https://api64.ipify.org 2>/dev/null || true)"
fi
[ -n "$PUBLIC_IP" ] || PUBLIC_IP="N/A"
[ -n "$LOCAL_IP" ] || LOCAL_IP="127.0.0.1"

log ""
ok "GPUPanel $VERSION installed."
log ""
if [ "$BIND_ADDRESS" = "127.0.0.1" ]; then
    log "  internal url : http://127.0.0.1:$PORT/$ENTRANCE"
else
    log "  external url : http://$PUBLIC_IP:$PORT/$ENTRANCE"
    log "  internal url : http://$LOCAL_IP:$PORT/$ENTRANCE"
fi
log "  panel dir    : $PANEL_DIR"
log "  binaries     : $PANEL_DIR/gpupanel-core, $PANEL_DIR/gpupanel-agent"
log "  control      : pctl start|stop|restart|status"
log "  username     : $USERNAME"
if [ "$PASSWORD_KNOWN" = "1" ]; then
    printf "  password     : %s\n" "$PASSWORD"
    log "  password     : (shown on terminal only; not retained in this log)"
    log ""
    log "  Remember the credentials above: the panel seeds its database with them"
    log "  on first boot and stops reading them from pctl."
else
    log "  password     : (unchanged -- the panel owns its credentials in its database)"
    log ""
    log "  This is a reinstall, so the existing credentials were kept. If you lost"
    log "  them, reset them with: $PANEL_DIR/gpupanel-core reset password"
fi
[ "$BIND_ADDRESS" = "127.0.0.1" ] || log "  Reminder: remember to open port $PORT in your cloud security group."
log ""
log "  install log  : $LOG_FILE"
log "================================================================"