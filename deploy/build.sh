#!/usr/bin/env bash
#
# Build GPUPanel from source and assemble an installable release package.
#
#   deploy/build.sh [--skip-frontend]
#
# Output:
#   build/release/gpupanel-<version>-<os>-<arch>/   payload directory
#   build/gpupanel-<version>-<os>-<arch>.tar.gz     tarball wrapping that dir
#
# The tarball layout is the contract used by the in-app upgrade path
# (core/app/service/upgrade.go): a *single* top-level directory named after the
# tarball, holding gpupanel-core, gpupanel-agent, pctl, GeoIP.mmdb, lang/ and
# initscript/ (the systemd units the upgrade re-copies into
# /etc/systemd/system). Do not flatten the tarball.
#
# install.sh and uninstall.sh ship inside the payload so the tarball is
# self-installable, mirroring the 1Panel release layout:
#
#   tar xzf gpupanel-<version>-linux-<arch>.tar.gz
#   sudo ./gpupanel-<version>-linux-<arch>/install.sh
#
# Env overrides: GOOS (default linux), GOARCH (default host arch), VERSION.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="$ROOT/build"
RELEASE="$BUILD/release"
WEB_SRC="$ROOT/frontend"
WEB_DIST="$ROOT/frontend/apps/panel/dist"
WEB_ROOT="$ROOT/core/cmd/server/web"
LANG_SRC="$ROOT/core/i18n/lang"
OPTIONAL_GEOIP="$ROOT/deploy/assets/GeoIP.mmdb"

GOOS_TARGET="${GOOS:-linux}"
GOARCH_TARGET="${GOARCH:-$(go env GOARCH)}"
# Package version is explicit release metadata, not the inherited app template version.
VERSION="${VERSION:-v0.1.0}"

SKIP_FRONTEND=0
for arg in "$@"; do
    case "$arg" in
        --skip-frontend) SKIP_FRONTEND=1 ;;
        -h|--help) sed -n '2,/^[^#]/p' "$0" | sed -e 's/^# \{0,1\}//' | head -n -1; exit 0 ;;
        *) echo "unknown argument: $arg" >&2; exit 1 ;;
    esac
done

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing required tool: $1" >&2; exit 1; }; }
need go
[ "$SKIP_FRONTEND" = "1" ] || need pnpm

echo "==> building frontend"
if [ "$SKIP_FRONTEND" = "1" ]; then
    echo "    skipped (--skip-frontend)"
else
    ( cd "$WEB_SRC" && pnpm install --frozen-lockfile && pnpm build )
    echo "==> embedding frontend into core/cmd/server/web"
    rm -rf "$WEB_ROOT/assets"
    cp -r "$WEB_DIST/assets" "$WEB_ROOT/assets"
    cp "$WEB_DIST/index.html" "$WEB_ROOT/index.html"
fi

echo "==> building backend ($GOOS_TARGET/$GOARCH_TARGET)"
mkdir -p "$BUILD"
( cd "$ROOT/core" && CGO_ENABLED=0 GOOS="$GOOS_TARGET" GOARCH="$GOARCH_TARGET" \
    go build -trimpath -ldflags '-s -w' -o "$BUILD/gpupanel-core" ./cmd/server )
( cd "$ROOT/agent" && CGO_ENABLED=0 GOOS="$GOOS_TARGET" GOARCH="$GOARCH_TARGET" \
    go build -trimpath -ldflags '-s -w' -o "$BUILD/gpupanel-agent" ./cmd/server )

# ---- assemble release payload ------------------------------------------------
# The CI runner deliberately uses umask 077 for passwords, SSH keys and VM
# images. The *public release archive*, however, must remain traversable by
# an ordinary non-root operator running the mandatory read-only preflight.
# Normalize payload directory/file permissions independent of caller umask;
# this subshell script does NOT relax the parent runner's private-file umask.
umask 022
# The package directory name must match the tarball stem: the upgrade code
# derives its extraction dir from the tarball name.
PKG_NAME="gpupanel-${VERSION}-${GOOS_TARGET}-${GOARCH_TARGET}"
PKG_DIR="$RELEASE/$PKG_NAME"

echo "==> assembling release payload $PKG_NAME"
rm -rf "$RELEASE"
mkdir -p "$PKG_DIR/initscript" "$PKG_DIR/lang"

cp "$BUILD/gpupanel-core" "$BUILD/gpupanel-agent" "$PKG_DIR/"
install -m 0755 "$ROOT/deploy/pctl" "$PKG_DIR/pctl"
install -m 0755 "$ROOT/scripts/gpupanel-install-preflight.py" "$PKG_DIR/gpupanel-install-preflight.py"
cp "$ROOT/LICENSE" "$ROOT/NOTICE.md" "$PKG_DIR/"
install -m 0755 "$ROOT/deploy/install.sh" "$PKG_DIR/install.sh"
install -m 0755 "$ROOT/deploy/uninstall.sh" "$PKG_DIR/uninstall.sh"
cp "$ROOT/deploy/conf/app.yaml" "$PKG_DIR/app.yaml"

# initscript/ holds the units the in-app upgrade copies into the service
# manager's config dir. Install.sh reads them from here too.
cp "$ROOT/deploy/systemd/gpupanel-core.service" "$PKG_DIR/initscript/"
cp "$ROOT/deploy/systemd/gpupanel-agent.service" "$PKG_DIR/initscript/"

# lang/ holds the shell-side message files the in-app upgrade copies to
# /usr/local/bin/lang.
if [ -d "$LANG_SRC" ]; then
    cp "$LANG_SRC"/*.yaml "$PKG_DIR/lang/"
else
    echo "    warning: $LANG_SRC not found, payload has no lang/" >&2
fi

# GeoIP.mmdb is fetched at runtime when absent; ship it only if vendored.
if [ -f "$OPTIONAL_GEOIP" ]; then
    cp "$OPTIONAL_GEOIP" "$PKG_DIR/GeoIP.mmdb"
else
    echo "    note: GeoIP.mmdb not vendored at $OPTIONAL_GEOIP (panel downloads it on first boot)"
fi

# Stamp the version so pctl's ORIGINAL_VERSION matches the binaries.
sed -i "s|^ORIGINAL_VERSION=.*|ORIGINAL_VERSION=${VERSION}|" "$PKG_DIR/pctl"
sed -i "s|^\(  version:\).*|\1 ${VERSION}|" "$PKG_DIR/app.yaml"

# ---- pack --------------------------------------------------------------------
TARBALL="$BUILD/${PKG_NAME}.tar.gz"
tar -C "$RELEASE" -czf "$TARBALL" "$PKG_NAME"

echo
echo "release payload : $PKG_DIR"
echo "tarball         : $TARBALL"
echo "payload layout  :"
( cd "$PKG_DIR" && find . -maxdepth 2 -not -name 'lang/*' | sort | sed 's|^\./||' | grep -v '^\.$' | sed 's/^/    /' )
ls -lh "$TARBALL"