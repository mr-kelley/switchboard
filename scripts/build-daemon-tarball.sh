#!/bin/bash
# Assemble the remote-installable daemon tarball.
#
# Contents:
#   switchboard-daemon/
#     bin/node                (bundled Node.js runtime — pinned to $NODE_VERSION)
#     dist/daemon/            (compiled TS output)
#     node_modules/ws/
#     node_modules/node-pty/  (including build/Release/pty.node — linux-x64)
#     README-daemon.txt
#
# Requires: `npm run build:daemon` has run and `node_modules/node-pty/build/Release/pty.node`
# exists (produced during npm install or by @electron/rebuild in npm run dist:appimage).
#
# Ships its own Node runtime so the target host does not need Node installed at
# all (or need a specific version). ABI-matched to the bundled node-pty prebuild.
# See DEC-000009.
#
# Node binary is cached under .cache/node/ across builds; delete to force
# re-download.

set -euo pipefail

NODE_VERSION="${NODE_VERSION:-20.19.0}"
VERSION=$(node -p "require('./package.json').version")
ARCH=linux-x64
OUT_DIR=release
OUT_FILE="switchboard-daemon-${VERSION}-${ARCH}.tar.gz"

if [ ! -d dist/daemon ]; then
  echo "error: dist/daemon not found — run 'npm run build:daemon' first" >&2
  exit 1
fi

if [ ! -f node_modules/node-pty/build/Release/pty.node ]; then
  echo "error: node_modules/node-pty/build/Release/pty.node not found." >&2
  echo "Run 'npm install' or 'npm run dist:appimage' first to populate the native build." >&2
  exit 1
fi

file node_modules/node-pty/build/Release/pty.node | grep -q 'x86-64' || {
  echo "error: node-pty was built for the wrong architecture (need x86-64)" >&2
  exit 1
}

# --- Fetch/cache Node binary ---------------------------------------------------
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

file "$CACHED_NODE" | grep -q 'x86-64' || {
  echo "error: cached node binary is not x86-64" >&2
  exit 1
}

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

# Readme
cat > "$ROOT/README-daemon.txt" <<'EOF'
Switchboard Daemon — remote installer bundle
============================================

This tarball is meant to be installed by the Switchboard client's
"Add remote daemon" flow. Manual install is possible but not the
supported path.

Requirements on the target host:
  - Linux x86_64
  - systemd with a --user session available (loginctl enable-linger
    if you want the daemon to survive logout)
  - Port 3717 free on 0.0.0.0

Node.js does NOT need to be installed on the target — this bundle
includes its own Node runtime under bin/node.

Manual install:
  1. Extract this tarball to ~/.local/share/switchboard/
     (produces ~/.local/share/switchboard/switchboard-daemon/)
  2. Copy or generate a systemd unit at
     ~/.config/systemd/user/switchboard-daemon.service pointing
     ExecStart at
     ~/.local/share/switchboard/switchboard-daemon/bin/node
     ~/.local/share/switchboard/switchboard-daemon/dist/daemon/daemon/daemon.js
     and setting Environment=SWITCHBOARD_HOST=0.0.0.0
  3. systemctl --user daemon-reload
  4. systemctl --user enable --now switchboard-daemon
  5. From the Switchboard client: Preferences > Daemons > Pair with
     daemon (host = this box, port = 3717). Read the 6-digit code from
     ~/.switchboard/pairing-code.txt and enter it.
EOF

mkdir -p "$OUT_DIR"
tar -czf "$OUT_DIR/$OUT_FILE" -C "$STAGE" switchboard-daemon

# Also emit a versionless copy so electron-builder's extraResources can grab a
# stable filename regardless of the current version bump. The versioned file
# is kept for release-asset uploads and manual install docs.
cp "$OUT_DIR/$OUT_FILE" "$OUT_DIR/switchboard-daemon.tar.gz"

SIZE=$(du -h "$OUT_DIR/$OUT_FILE" | cut -f1)
echo "wrote $OUT_DIR/$OUT_FILE ($SIZE) and switchboard-daemon.tar.gz"
