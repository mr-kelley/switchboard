#!/bin/bash
# Assemble the remote-installable daemon tarball for a given target arch.
#
# Selects arch via the ARCH env var (default linux-x64 for backward-compat with
# the pre-DEC-000012 flow). Supported arches:
#   linux-x64      (x86_64 hosts)
#   linux-arm64    (aarch64: Pi 4/5 64-bit, other ARM64 SBCs)
#   linux-armv7l   (armv7l: Pi 2/3, 32-bit Pi installs)
#
# Contents (identical layout across arches; only the binaries differ):
#   switchboard-daemon/
#     bin/node                (bundled Node.js runtime for the target ARCH)
#     dist/daemon/            (compiled TS output — arch-agnostic)
#     node_modules/ws/        (pure JS)
#     node_modules/node-pty/  (including build/Release/pty.node — matches ARCH)
#     README-daemon.txt
#
# Requires: `npm run build:daemon` has run (arch-agnostic) and
# `node_modules/node-pty/build/Release/pty.node` was compiled for the target ARCH
# (typically by running the build under the target arch — natively or via QEMU;
# see specs/scripts/build-daemon-tarball-spec.md §CI).
#
# Ships its own Node runtime so the target host does not need Node installed at
# all (or need a specific version). ABI-matched to the bundled node-pty prebuild.
# See DEC-000009 (bundled Node) + DEC-000012 (multi-arch).
#
# Node binary is cached under .cache/node/v${NODE_VERSION}-${ARCH}/ across builds;
# delete to force re-download.

set -euo pipefail

NODE_VERSION="${NODE_VERSION:-20.19.0}"
VERSION=$(node -p "require('./package.json').version")
ARCH="${ARCH:-linux-x64}"
OUT_DIR=release
OUT_FILE="switchboard-daemon-${VERSION}-${ARCH}.tar.gz"
# Stable-name mirror that electron-builder's extraResources glob picks up.
# Per DEC-000012 this is now arch-suffixed — the AppImage carries one per arch.
STABLE_NAME="switchboard-daemon-${ARCH}.tar.gz"

# --- Validate ARCH + derive expected `file` magic -----------------------------
case "$ARCH" in
  linux-x64)
    EXPECTED_MAGIC='x86-64'
    ;;
  linux-arm64)
    EXPECTED_MAGIC='aarch64'
    ;;
  linux-armv7l)
    # `file` reports ELF 32-bit ARM EABI5 for armv7l builds.
    EXPECTED_MAGIC='EABI'
    ;;
  *)
    echo "error: unsupported ARCH: $ARCH" >&2
    echo "supported: linux-x64, linux-arm64, linux-armv7l" >&2
    exit 1
    ;;
esac

if [ ! -d dist/daemon ]; then
  echo "error: dist/daemon not found — run 'npm run build:daemon' first" >&2
  exit 1
fi

if [ ! -f node_modules/node-pty/build/Release/pty.node ]; then
  echo "error: node_modules/node-pty/build/Release/pty.node not found." >&2
  echo "Run 'npm install' or 'npm run dist:appimage' first to populate the native build." >&2
  exit 1
fi

# Verify the local node-pty matches the target ARCH. Cross-arch builds must
# have staged a pre-built pty.node from a matching-arch environment beforehand
# (native runner or QEMU) — this script does not cross-compile it.
if ! file node_modules/node-pty/build/Release/pty.node | grep -q "$EXPECTED_MAGIC"; then
  echo "error: node-pty was built for the wrong architecture (need ${ARCH}, expected '${EXPECTED_MAGIC}' magic)" >&2
  echo "actual: $(file node_modules/node-pty/build/Release/pty.node)" >&2
  exit 1
fi

# --- Fetch/cache Node binary --------------------------------------------------
CACHE_DIR=".cache/node/v${NODE_VERSION}-${ARCH}"
CACHED_NODE="$CACHE_DIR/bin/node"

if [ ! -f "$CACHED_NODE" ]; then
  echo "downloading Node.js v${NODE_VERSION} for ${ARCH}..."
  mkdir -p "$CACHE_DIR/bin"
  TARBALL="node-v${NODE_VERSION}-${ARCH}.tar.xz"
  URL="https://nodejs.org/dist/v${NODE_VERSION}/${TARBALL}"
  DL_TMP=$(mktemp -d)
  curl -fsSL "$URL" -o "$DL_TMP/$TARBALL"
  # Extract just bin/node (single binary, ~90 MB uncompressed) — skip
  # npm/npx/docs/headers, we only need the runtime.
  tar -xJf "$DL_TMP/$TARBALL" -C "$DL_TMP" "node-v${NODE_VERSION}-${ARCH}/bin/node"
  cp "$DL_TMP/node-v${NODE_VERSION}-${ARCH}/bin/node" "$CACHED_NODE"
  chmod 755 "$CACHED_NODE"
  rm -rf "$DL_TMP"
  echo "cached at $CACHED_NODE"
fi

if ! file "$CACHED_NODE" | grep -q "$EXPECTED_MAGIC"; then
  echo "error: cached node binary is not ${ARCH} (expected '${EXPECTED_MAGIC}' magic)" >&2
  echo "actual: $(file "$CACHED_NODE")" >&2
  exit 1
fi

# --- Stage the tarball --------------------------------------------------------
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

ROOT="$STAGE/switchboard-daemon"
mkdir -p "$ROOT/bin"

# Bundled Node
cp "$CACHED_NODE" "$ROOT/bin/node"
chmod 755 "$ROOT/bin/node"

# Compiled daemon (only dist/daemon — main + renderer are not needed on the server)
mkdir -p "$ROOT/dist"
cp -r dist/daemon "$ROOT/dist/daemon"

# ws is pure JS; copy it entirely (drop the test dir to keep size down)
mkdir -p "$ROOT/node_modules"
cp -r node_modules/ws "$ROOT/node_modules/ws"
rm -rf "$ROOT/node_modules/ws/test" 2>/dev/null || true

# node-pty needs its build output, lib, and package.json. Skip source, tests, deps.
mkdir -p "$ROOT/node_modules/node-pty"
cp node_modules/node-pty/package.json "$ROOT/node_modules/node-pty/"
cp -r node_modules/node-pty/lib "$ROOT/node_modules/node-pty/lib"
cp -r node_modules/node-pty/build "$ROOT/node_modules/node-pty/build"

# Readme (mTLS-era; supported install path is the client's remote-provisioner flow).
cat > "$ROOT/README-daemon.txt" <<README_END
Switchboard Daemon — remote installer bundle (${ARCH})
======================================================

This tarball is meant to be installed by the Switchboard client's
"Add remote daemon" flow, which uploads it, an operator-issued cert
bundle, and a systemd unit. Manual install is possible but not the
supported path.

Requirements on the target host:
  - Linux, architecture: ${ARCH}
  - systemd with a --user session available (loginctl enable-linger
    if you want the daemon to survive logout)
  - Port 3717 free
  - A lab-CA-issued server cert bundle (server.crt, server.key, ca.crt)
    placed at ~/.switchboard/tls/ (0700 on the dir, 0600 on the key,
    0644 on the certs). Auth is mutual TLS keyed off the lab CA — see
    DEC-000010. There is no pairing code or bearer token.

Node.js does NOT need to be installed on the target — this bundle
includes its own Node runtime under bin/node.

Manual install:
  1. Extract this tarball to ~/.local/share/switchboard/
     (produces ~/.local/share/switchboard/switchboard-daemon/)
  2. Place your lab-CA cert bundle at ~/.switchboard/tls/ with the
     perms above.
  3. Copy or generate a systemd user unit at
     ~/.config/systemd/user/switchboard-daemon.service with:
       Environment=SWITCHBOARD_HOST=::
       Environment=SWITCHBOARD_TLS_DIR=\$HOME/.switchboard/tls
       ExecStart=~/.local/share/switchboard/switchboard-daemon/bin/node \\
                 ~/.local/share/switchboard/switchboard-daemon/dist/daemon/daemon/daemon.js
       Restart=on-failure
  4. systemctl --user daemon-reload && systemctl --user enable --now switchboard-daemon
  5. From the Switchboard client: Preferences > Add daemon (host + port);
     the client's own cert authenticates it to the daemon.
README_END

mkdir -p "$OUT_DIR"
tar -czf "$OUT_DIR/$OUT_FILE" -C "$STAGE" switchboard-daemon

# Stable-name mirror for electron-builder's extraResources glob (one per arch).
cp "$OUT_DIR/$OUT_FILE" "$OUT_DIR/$STABLE_NAME"

SIZE=$(du -h "$OUT_DIR/$OUT_FILE" | cut -f1)
echo "wrote $OUT_DIR/$OUT_FILE ($SIZE) and $STABLE_NAME"
